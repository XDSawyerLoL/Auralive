use std::{
    collections::{BTreeMap, BTreeSet},
    future::Future,
    sync::Arc,
    time::Instant,
};

use anyhow::{anyhow, bail, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::task::JoinSet;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TaskNode {
    pub id: String,
    pub capability: String,
    #[serde(default)]
    pub depends_on: Vec<String>,
    #[serde(default)]
    pub input: Value,
    #[serde(default = "default_timeout_ms")]
    pub timeout_ms: u64,
}

fn default_timeout_ms() -> u64 {
    15_000
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TaskGraph {
    #[serde(default)]
    pub id: String,
    pub objective: String,
    #[serde(default = "default_parallelism")]
    pub max_parallel: usize,
    pub nodes: Vec<TaskNode>,
}

fn default_parallelism() -> usize {
    8
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NodeOutcome {
    pub id: String,
    pub capability: String,
    pub ok: bool,
    pub result: Value,
    pub error: String,
    pub elapsed_ms: u128,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GraphOutcome {
    pub ok: bool,
    pub objective: String,
    pub nodes: BTreeMap<String, NodeOutcome>,
    pub elapsed_ms: u128,
}

pub fn validate_graph(graph: &TaskGraph, max_nodes: usize) -> Result<()> {
    if graph.nodes.is_empty() {
        bail!("DAG AURA vide");
    }
    if graph.nodes.len() > max_nodes {
        bail!("DAG AURA trop grand: {}/{}", graph.nodes.len(), max_nodes);
    }

    let mut ids = BTreeSet::new();
    for node in &graph.nodes {
        if node.id.trim().is_empty() || node.capability.trim().is_empty() {
            bail!("nœud ou capability vide");
        }
        if !ids.insert(node.id.clone()) {
            bail!("nœud dupliqué: {}", node.id);
        }
        if node.depends_on.iter().any(|dep| dep == &node.id) {
            bail!("auto-dépendance interdite: {}", node.id);
        }
    }

    for node in &graph.nodes {
        for dep in &node.depends_on {
            if !ids.contains(dep) {
                bail!("dépendance inconnue {dep} pour {}", node.id);
            }
        }
    }

    let mut unresolved: BTreeMap<String, BTreeSet<String>> = graph
        .nodes
        .iter()
        .map(|node| {
            (
                node.id.clone(),
                node.depends_on.iter().cloned().collect::<BTreeSet<_>>(),
            )
        })
        .collect();
    let mut resolved = BTreeSet::new();

    while !unresolved.is_empty() {
        let ready: Vec<String> = unresolved
            .iter()
            .filter(|(_, deps)| deps.iter().all(|dep| resolved.contains(dep)))
            .map(|(id, _)| id.clone())
            .collect();
        if ready.is_empty() {
            bail!("cycle détecté dans le DAG AURA");
        }
        for id in ready {
            unresolved.remove(&id);
            resolved.insert(id);
        }
    }
    Ok(())
}

pub async fn execute_graph<F, Fut>(
    graph: TaskGraph,
    max_nodes: usize,
    runner: F,
) -> Result<GraphOutcome>
where
    F: Fn(TaskNode, BTreeMap<String, Value>) -> Fut + Send + Sync + 'static,
    Fut: Future<Output = Result<Value>> + Send + 'static,
{
    validate_graph(&graph, max_nodes)?;
    let started = Instant::now();
    let parallelism = graph.max_parallel.clamp(1, 64);
    let runner = Arc::new(runner);
    let mut pending: BTreeMap<String, TaskNode> = graph
        .nodes
        .iter()
        .cloned()
        .map(|node| (node.id.clone(), node))
        .collect();
    let mut outcomes: BTreeMap<String, NodeOutcome> = BTreeMap::new();

    while !pending.is_empty() {
        let ready: Vec<String> = pending
            .iter()
            .filter(|(_, node)| {
                node.depends_on.iter().all(|dep| {
                    outcomes
                        .get(dep)
                        .map(|result| result.ok)
                        .unwrap_or(false)
                })
            })
            .map(|(id, _)| id.clone())
            .take(parallelism)
            .collect();

        if ready.is_empty() {
            let blocked = pending
                .values()
                .map(|node| {
                    let deps = node
                        .depends_on
                        .iter()
                        .filter(|dep| !outcomes.get(*dep).map(|row| row.ok).unwrap_or(false))
                        .cloned()
                        .collect::<Vec<_>>();
                    format!("{} <- {:?}", node.id, deps)
                })
                .collect::<Vec<_>>()
                .join(", ");
            bail!("DAG bloqué après échec ou dépendance non résolue: {blocked}");
        }

        let mut set = JoinSet::new();
        for id in ready {
            let node = pending
                .remove(&id)
                .ok_or_else(|| anyhow!("nœud prêt introuvable: {id}"))?;
            let dependency_results: BTreeMap<String, Value> = node
                .depends_on
                .iter()
                .filter_map(|dep| {
                    outcomes
                        .get(dep)
                        .map(|row| (dep.clone(), row.result.clone()))
                })
                .collect();
            let run = runner.clone();
            set.spawn(async move {
                let started = Instant::now();
                let timeout_ms = node.timeout_ms.clamp(500, 120_000);
                let response = tokio::time::timeout(
                    std::time::Duration::from_millis(timeout_ms),
                    run(node.clone(), dependency_results),
                )
                .await;
                let elapsed_ms = started.elapsed().as_millis();
                match response {
                    Ok(Ok(result)) => NodeOutcome {
                        id: node.id,
                        capability: node.capability,
                        ok: true,
                        result,
                        error: String::new(),
                        elapsed_ms,
                    },
                    Ok(Err(error)) => NodeOutcome {
                        id: node.id,
                        capability: node.capability,
                        ok: false,
                        result: Value::Null,
                        error: error.to_string(),
                        elapsed_ms,
                    },
                    Err(_) => NodeOutcome {
                        id: node.id,
                        capability: node.capability,
                        ok: false,
                        result: Value::Null,
                        error: format!("timeout après {timeout_ms} ms"),
                        elapsed_ms,
                    },
                }
            });
        }

        while let Some(joined) = set.join_next().await {
            let outcome = joined.map_err(|error| anyhow!("worker Rust interrompu: {error}"))?;
            outcomes.insert(outcome.id.clone(), outcome);
        }

        if outcomes.values().any(|row| !row.ok) {
            break;
        }
    }

    let ok = pending.is_empty() && outcomes.values().all(|row| row.ok);
    Ok(GraphOutcome {
        ok,
        objective: graph.objective,
        nodes: outcomes,
        elapsed_ms: started.elapsed().as_millis(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn rejects_cycles() {
        let graph = TaskGraph {
            id: "cycle".into(),
            objective: "test".into(),
            max_parallel: 2,
            nodes: vec![
                TaskNode {
                    id: "a".into(),
                    capability: "source".into(),
                    depends_on: vec!["b".into()],
                    input: json!({}),
                    timeout_ms: 1000,
                },
                TaskNode {
                    id: "b".into(),
                    capability: "source".into(),
                    depends_on: vec!["a".into()],
                    input: json!({}),
                    timeout_ms: 1000,
                },
            ],
        };
        assert!(validate_graph(&graph, 16).is_err());
    }

    #[tokio::test]
    async fn executes_parallel_wave_then_dependency() {
        let graph = TaskGraph {
            id: "ok".into(),
            objective: "merge".into(),
            max_parallel: 4,
            nodes: vec![
                TaskNode {
                    id: "a".into(),
                    capability: "source".into(),
                    depends_on: vec![],
                    input: json!({"value":"A"}),
                    timeout_ms: 1000,
                },
                TaskNode {
                    id: "b".into(),
                    capability: "source".into(),
                    depends_on: vec![],
                    input: json!({"value":"B"}),
                    timeout_ms: 1000,
                },
                TaskNode {
                    id: "merge".into(),
                    capability: "merge".into(),
                    depends_on: vec!["a".into(), "b".into()],
                    input: json!({}),
                    timeout_ms: 1000,
                },
            ],
        };

        let outcome = execute_graph(graph, 16, |node, deps| async move {
            match node.capability.as_str() {
                "source" => Ok(node.input["value"].clone()),
                "merge" => Ok(json!([
                    deps["a"].as_str().unwrap_or_default(),
                    deps["b"].as_str().unwrap_or_default()
                ])),
                other => bail!("capability inattendue: {other}"),
            }
        })
        .await
        .expect("graph");

        assert!(outcome.ok);
        assert_eq!(outcome.nodes["merge"].result, json!(["A", "B"]));
    }
}
