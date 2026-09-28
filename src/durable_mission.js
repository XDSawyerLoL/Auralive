import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export class JsonMissionStore {
  constructor(filePath) {
    if (!filePath) throw new Error('mission store path required');
    this.filePath = path.resolve(String(filePath));
  }

  async loadAll() {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8'));
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      if (error?.code === 'ENOENT') return {};
      throw error;
    }
  }

  async get(id) {
    return (await this.loadAll())[String(id)] || null;
  }

  async save(mission) {
    const all = await this.loadAll();
    all[String(mission.id)] = mission;
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temp = this.filePath + '.tmp-' + process.pid;
    await writeFile(temp, JSON.stringify(all), { encoding: 'utf8', mode: 0o600 });
    await rename(temp, this.filePath);
    return mission;
  }
}

export class ResumableMissionRunner {
  constructor({ store, executeCapability } = {}) {
    if (!store?.get || !store?.save) throw new Error('mission store required');
    if (typeof executeCapability !== 'function') throw new Error('mission executor required');
    this.store = store;
    this.executeCapability = executeCapability;
  }

  async start({ id, objective = '', steps = [] } = {}) {
    const mission = {
      id: String(id || '').trim(),
      objective: String(objective || '').trim(),
      status: 'running',
      current_step: 0,
      virtual_elapsed_ms: 0,
      revision_count: 0,
      resumed_count: 0,
      steps: (Array.isArray(steps) ? steps : []).map((step, index) => ({
        id: String(step.id || 'step-' + (index + 1)),
        preferred: String(step.preferred || ''),
        fallback: String(step.fallback || ''),
        duration_ms: Math.max(0, Number(step.duration_ms || 0)),
        status: 'pending',
        attempts: 0,
        result: null,
        used_capability: '',
      })),
      events: [],
    };
    if (!mission.id || !mission.steps.length) throw new Error('mission invalide');
    await this.store.save(mission);
    return mission;
  }

  async resume(id) {
    const mission = await this.store.get(id);
    if (!mission) throw new Error('mission inconnue');
    mission.resumed_count = Number(mission.resumed_count || 0) + 1;
    mission.events.push({ type: 'resume', step: mission.current_step });
    await this.store.save(mission);
    return mission;
  }

  async runSlice(id, { maxCompletedSteps = 1 } = {}) {
    const mission = await this.store.get(id);
    if (!mission) throw new Error('mission inconnue');
    if (mission.status === 'completed') return mission;

    let completed = 0;
    while (mission.current_step < mission.steps.length && completed < Math.max(1, Number(maxCompletedSteps || 1))) {
      const step = mission.steps[mission.current_step];
      const candidates = [step.preferred, step.fallback].filter(Boolean);
      let succeeded = false;
      let lastError = '';

      for (let index = 0; index < candidates.length; index += 1) {
        const capability = candidates[index];
        step.attempts += 1;
        try {
          const outcome = await this.executeCapability(capability, {
            mission,
            step,
            attempt: step.attempts,
          });
          if (outcome?.ok === false) throw new Error(outcome.error || 'capability failed');
          step.result = outcome?.result ?? outcome;
          step.used_capability = capability;
          step.status = 'completed';
          if (index > 0) {
            mission.revision_count += 1;
            mission.events.push({
              type: 'replan',
              step: step.id,
              from: step.preferred,
              to: capability,
            });
          }
          succeeded = true;
          break;
        } catch (error) {
          lastError = String(error?.message || error);
          mission.events.push({
            type: 'attempt-failed',
            step: step.id,
            capability,
            error: lastError.slice(0, 500),
          });
        }
      }

      if (!succeeded) {
        step.status = 'failed';
        mission.status = 'blocked';
        mission.events.push({ type: 'blocked', step: step.id, error: lastError.slice(0, 500) });
        await this.store.save(mission);
        return mission;
      }

      mission.virtual_elapsed_ms += step.duration_ms;
      mission.current_step += 1;
      completed += 1;
      mission.events.push({
        type: 'checkpoint',
        step: step.id,
        virtual_elapsed_ms: mission.virtual_elapsed_ms,
      });
      await this.store.save(mission);
    }

    if (mission.current_step >= mission.steps.length) {
      mission.status = 'completed';
      mission.events.push({ type: 'completed', virtual_elapsed_ms: mission.virtual_elapsed_ms });
      await this.store.save(mission);
    }
    return mission;
  }
}
