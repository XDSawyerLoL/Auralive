"""AURA administrative desktop UI (local-only, no network or model).

Tkinter is part of standard Windows Python installations. All I/O runs
in a background thread; GUI elements are only touched on the UI thread.
"""
from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox, scrolledtext, simpledialog, ttk

from .admin_assistant import plan_french_administrative_request
from .admin_chat import complete_followup, render_result
from .personal_cli import execute_command
from argparse import Namespace


class AdministrativeDesktop(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("AURA · Assistant administratif local")
        self.geometry("850x670")
        self.minsize(640, 500)
        self.root_directory = tk.StringVar(value="")
        self.prompt = tk.StringVar(value="")
        self.status = tk.StringVar(value="Sélectionner un dossier autorisé pour commencer.")
        self.pending_intent = ""
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="aura-admin")
        self.current_job = None
        self.job_root = ""
        self.reminder_job = None
        self.reminder_root = ""

        self.configure(background="#11151d")
        body = ttk.Frame(self, padding=20)
        body.pack(fill="both", expand=True)
        ttk.Label(body, text="AURA — Assistante administrative locale",
                  font=("Segoe UI", 18, "bold")).pack(anchor="w", pady=(0, 8))
        ttk.Label(body, text="Lecture seule par défaut. Aucun fichier envoyé, aucun modèle payant.",
                  wraplength=760).pack(anchor="w", pady=(0, 15))

        folder = ttk.LabelFrame(body, text="1. Dossier autorisé", padding=10)
        folder.pack(fill="x", pady=(0, 15))
        ttk.Entry(folder, textvariable=self.root_directory, state="readonly").pack(
            side="left", fill="x", expand=True, padx=(0, 8))
        ttk.Button(folder, text="Choisir…", command=self.choose_folder).pack(side="right")

        ask = ttk.LabelFrame(body, text="2. Votre demande en français", padding=10)
        ask.pack(fill="x", pady=(0, 12))
        entry = ttk.Entry(ask, textvariable=self.prompt, font=("Segoe UI", 11))
        entry.pack(fill="x", pady=(0, 8))
        entry.bind("<Return>", lambda _event: self.submit())
        self.entry = entry
        tools = ttk.Frame(ask)
        tools.pack(fill="x")
        ttk.Button(tools, text="Analyser", command=self.submit).pack(side="left")
        ttk.Button(tools, text="Inventorier les papiers", command=lambda: self.run_example(
            "Organise toute ma vie administrative")).pack(side="left", padx=8)
        ttk.Button(tools, text="Retrouver les factures", command=lambda: self.run_example(
            "Retrouve mes factures")).pack(side="left")
        ttk.Button(tools, text="Vérifier AURA", command=self.verify_runtime).pack(
            side="right")
        extra = ttk.Frame(ask)
        extra.pack(fill="x", pady=(8, 0))
        ttk.Button(
            extra, text="Factures + paiements : rechercher doublons et rapprochements",
            command=lambda: self.run_example("Analyse mes factures et paiements"),
        ).pack(side="left")
        ttk.Button(
            extra, text="Mon suivi administratif",
            command=lambda: self.run_example("Prépare mon suivi administratif"),
        ).pack(side="left", padx=8)
        saved = ttk.Frame(ask)
        saved.pack(fill="x", pady=(8, 0))
        ttk.Button(saved, text="Mes contrôles enregistrés", command=self.show_saved).pack(side="left")
        ttk.Button(saved, text="Marquer examiné", command=self.mark_reviewed).pack(side="left", padx=6)
        ttk.Button(saved, text="Créer un rappel confirmé", command=self.schedule_reminder).pack(side="left")
        ttk.Button(saved, text="Rappels dus", command=self.show_due).pack(side="left", padx=6)

        results = ttk.LabelFrame(body, text="3. Résultats et éléments vérifiés", padding=10)
        results.pack(fill="both", expand=True)
        self.output = scrolledtext.ScrolledText(
            results, wrap="word", font=("Consolas", 10), height=14,
            foreground="#e8edf4", background="#18212e",
            insertbackground="#e8edf4", state="disabled",
        )
        self.output.pack(fill="both", expand=True)
        self.append("AURA : Choisissez un dossier, puis donnez une instruction.")
        ttk.Label(body, textvariable=self.status, wraplength=760).pack(
            fill="x", anchor="w", pady=(10, 0))
        self.protocol("WM_DELETE_WINDOW", self.close)

    def append(self, text: str) -> None:
        self.output.configure(state="normal")
        self.output.insert("end", str(text).strip() + "\n\n")
        self.output.see("end")
        self.output.configure(state="disabled")

    def choose_folder(self) -> None:
        selected = filedialog.askdirectory(title="Autoriser ce dossier à AURA")
        if selected:
            path = Path(selected).resolve()
            if path.is_dir():
                self.root_directory.set(str(path))
                self.pending_intent = ""
                self.status.set(f"Dossier autorisé : {path}. Aucune lecture automatique.")
                self.append("AURA : Dossier autorisé. Donnez une instruction pour commencer.")
                self.show_due(silent_empty=True)

    def run_example(self, message: str) -> None:
        self.prompt.set(message)
        self.submit()

    def submit(self) -> None:
        if self.current_job and not self.current_job.done():
            self.status.set("Une tâche est déjà en cours.")
            return
        root = self.root_directory.get()
        if not root or not Path(root).is_dir():
            messagebox.showwarning("Dossier requis", "Choisissez d'abord un dossier autorisé.")
            return
        request = self.prompt.get().strip()
        if not request:
            return
        self.append("Vous : " + request)
        self.prompt.set("")
        if self.pending_intent:
            completed = complete_followup(self.pending_intent, request)
            self.pending_intent = ""
            if completed:
                request = completed
        plan = plan_french_administrative_request(request)
        if plan is None:
            self.append("AURA : Cette demande dépasse mes compétences administratives actuelles.")
            return
        if not plan["actions"]:
            self.pending_intent = plan["intent"] if plan["intent"] in {
                "budget-needs-csv", "compare-needs-files", "backup-needs-file",
                "search-needs-term",
                "pdf-needs-file",
            } else ""
            details = plan["summary"]
            if plan.get("needs"):
                details += "\nPrécision demandée : " + plan["needs"][0]
            self.append("AURA : " + details)
            self.status.set("Aucune action effectuée.")
            return
        backup = any(action.get("type") == "files.backup" for action in plan["actions"])
        if backup:
            file_name = str(plan["actions"][0].get("path") or "")
            approved = messagebox.askyesno(
                "Confirmer la sauvegarde locale",
                f"Créer une copie vérifiée de « {file_name} » dans le dossier autorisé ?\n"
                "L'original ne sera pas modifié."
            )
            if not approved:
                self.append("AURA : Sauvegarde annulée. Aucun fichier créé.")
                return
        self.status.set("Exécution locale en cours…")
        self.job_root = root
        self.current_job = self.executor.submit(
            lambda: asyncio.run(execute_command(Namespace(
                root=root, command="ask", request=request, allow_backup=backup,
            )))
        )
        self.after(100, self.check_job)

    def verify_runtime(self) -> None:
        """Execute real local benchmarks without touching user documents."""
        if self.current_job and not self.current_job.done():
            self.status.set("Une tâche est déjà en cours.")
            return
        self.append("AURA : vérification des tâches locales sur des fichiers temporaires.")
        self.status.set("Tests d'intégration locaux en cours…")

        async def benchmark():
            from .personal_benchmark import run_benchmark as personal
            from .admin_benchmark import run_benchmark as admin
            first, second = await personal(), await admin()
            try:
                from .pdf_benchmark import run_benchmark as pdf
                third = pdf()
            except Exception as exc:
                third = {"ok": False, "checks_total": 0, "checks_passed": 0,
                         "error": f"{type(exc).__name__}: {str(exc)[:180]}"}
            try:
                from .admin_portfolio_benchmark import run_benchmark as portfolio
                fourth = portfolio()
            except Exception as exc:
                fourth = {"ok": False, "checks_total": 0, "checks_passed": 0,
                          "error": f"{type(exc).__name__}: {str(exc)[:180]}"}
            try:
                from .admin_followup_benchmark import run_benchmark as followup
                fifth = followup()
            except Exception as exc:
                fifth = {"ok": False, "checks_total": 0, "checks_passed": 0,
                         "error": f"{type(exc).__name__}: {str(exc)[:180]}"}
            try:
                from .admin_durable_benchmark import run_benchmark as durable
                sixth = durable()
            except Exception as exc:
                sixth = {"ok": False, "checks_total": 0, "checks_passed": 0,
                         "error": f"{type(exc).__name__}: {str(exc)[:180]}"}
            return {"mode": "diagnostic", "personal": first,
                    "administrative": second, "pdf": third,
                    "portfolio": fourth, "followup": fifth, "durable": sixth}

        self.current_job = self.executor.submit(lambda: asyncio.run(benchmark()))
        self.after(100, self.check_job)

    def check_job(self) -> None:
        if not self.current_job:
            return
        if not self.current_job.done():
            self.after(100, self.check_job)
            return
        try:
            result = self.current_job.result()
            if result.get("mode") == "diagnostic":
                first, second, third, fourth, fifth, sixth = (
                    result["personal"], result["administrative"],
                    result["pdf"], result["portfolio"], result["followup"],
                    result["durable"]
                )
                suites = (first, second, third, fourth, fifth, sixth)
                passed = sum(int(x.get("checks_passed", 0)) for x in suites)
                total = sum(int(x.get("checks_total", 0)) for x in suites)
                verified = (
                    all(x.get("ok") is True for x in suites)
                    and total == 62 and passed == total
                )
                failed = [
                    item.get("name", "inconnu")
                    for suite in suites for item in suite.get("checks", [])
                    if not item.get("passed")
                ]
                if third.get("error"):
                    failed.append("PDF non vérifié : " + str(third["error"])[:140])
                if fourth.get("error"):
                    failed.append("Rapprochements non vérifiés : " + str(fourth["error"])[:140])
                if fifth.get("error"):
                    failed.append("Suivi non vérifié : " + str(fifth["error"])[:140])
                if sixth.get("error"):
                    failed.append("Mémoire SQLite non vérifiée : " + str(sixth["error"])[:140])
                self.append(
                    f"AURA : {passed}/{total} contrôles locaux réussis. "
                    + ("Tous les benchmarks locaux ont réussi." if verified
                       else "Contrôles incomplets : "
                       + (", ".join(failed[:8]) or "résultat incomplet"))
                )
                self.status.set("Benchmarks locaux vérifiés (hors interface Windows)."
                                if verified else "Des contrôles sont non vérifiés ou en échec.")
            else:
                self.append("AURA : " + render_result(result))
                if result.get("executed") is True and self.job_root == self.root_directory.get():
                    for step in result.get("steps") or []:
                        if step.get("type") == "admin.followup" and messagebox.askyesno(
                            "Mémoire AURA locale",
                            "Enregistrer les contrôles et leurs empreintes dans une base privée sur ce PC ? "
                            "Aucun document complet ne sera conservé dans la base.",
                        ):
                            try:
                                from .admin_durable import DurableReviews, local_db_path
                                store = DurableReviews(local_db_path(Path(self.job_root)))
                                outcome = store.save_snapshot(step)
                                self.append(f"AURA : {outcome['saved']} contrôle(s) conservé(s), "
                                            f"{outcome['new']} nouveau(x), "
                                            f"{outcome['changed_reset']} validation(s) invalidée(s).")
                            except Exception as exc:
                                self.append(f"AURA : enregistrement impossible : {type(exc).__name__}: {exc}")
                self.status.set(
                    "Action vérifiée localement." if result.get("executed") is True
                    else "Action refusée, incomplète ou en échec."
                )
            if result.get("mode") != "diagnostic" and not result.get("executed") and result.get("needs"):
                self.pending_intent = str(result.get("intent") or "")
        except Exception as error:
            self.append(f"AURA : Erreur : {type(error).__name__}: {str(error)[:300]}")
            self.status.set("L'action n'a pas été certifiée.")
        self.current_job = None

    def _existing_store(self):
        root = self.root_directory.get()
        if not root or not Path(root).is_dir():
            messagebox.showwarning("Dossier requis", "Choisissez un dossier autorisé.")
            return None
        from .admin_durable import DurableReviews, local_db_path
        location = local_db_path(Path(root))
        if not location.is_file():
            messagebox.showinfo("Mémoire AURA", "Aucun suivi sauvegardé pour ce dossier.")
            return None
        return DurableReviews(location)

    def show_saved(self) -> None:
        try:
            store = self._existing_store()
            if store is None:
                return
            tasks = store.list_reviews()
            self.append(
                "AURA : contrôles locaux conservés :\n"
                + ("\n".join(
                    f"{item['task_id']} — {item['status']} — {item['title']} — {item['source']}"
                    for item in tasks
                ) if tasks else "Aucun contrôle actif.")
            )
        except Exception as exc:
            messagebox.showerror("Mémoire AURA", f"{type(exc).__name__}: {exc}")

    def mark_reviewed(self) -> None:
        try:
            store = self._existing_store()
            if store is None:
                return
            key = simpledialog.askstring("Contrôle humain", "Identifiant exact de la tâche (16 caractères) :")
            if not key:
                return
            if not messagebox.askyesno(
                "Contrôle humain",
                "As-tu personnellement examiné cette vérification ? "
                "Cela ne signifie pas qu'une facture est payée.",
            ):
                return
            store.decide(key.strip(), "reviewed")
            self.append(f"AURA : {key.strip()} marqué examiné après confirmation humaine.")
        except Exception as exc:
            messagebox.showerror("Contrôle humain", f"{type(exc).__name__}: {exc}")

    def schedule_reminder(self) -> None:
        try:
            store = self._existing_store()
            if store is None:
                return
            key = simpledialog.askstring("Rappel local", "Identifiant d'une tâche déjà examinée :")
            if not key:
                return
            when = simpledialog.askstring(
                "Rappel local", "Date et heure AVEC fuseau : 2026-11-25T09:00:00+01:00"
            )
            if not when:
                return
            identifier = store.propose_reminder(key.strip(), when.strip())
            if messagebox.askyesno(
                "Autoriser ce rappel ?",
                f"Confirmer ce rappel local au {when} ? "
                "Il n'est visible que quand l'assistant est ouvert ; aucun envoi externe.",
            ):
                store.approve_reminder(identifier)
                self.append(f"AURA : rappel local approuvé : {identifier}")
            else:
                self.append("AURA : rappel seulement proposé, non activé.")
        except Exception as exc:
            messagebox.showerror("Rappel local", f"{type(exc).__name__}: {exc}")

    def show_due(self, *, silent_empty: bool = False) -> None:
        root = self.root_directory.get()
        if not root or not Path(root).is_dir():
            if not silent_empty:
                messagebox.showwarning("Dossier requis", "Choisis d'abord un dossier autorisé.")
            return
        if self.reminder_job and not self.reminder_job.done():
            self.status.set("Vérification des rappels déjà en cours.")
            return
        from .admin_durable import local_db_path
        location = local_db_path(Path(root))
        if not location.is_file():
            if not silent_empty:
                messagebox.showinfo("Rappels AURA", "Aucun suivi local enregistré.")
            return

        def verify_due():
            from .admin_durable import DurableReviews
            from .admin_portfolio import analyze_portfolio
            from .admin_followup import build_followup_board
            store = DurableReviews(location)
            pending = store.due_reminders()
            if not pending:
                return {"due": []}
            board = build_followup_board(analyze_portfolio(Path(root)))
            if board.get("partial"):
                return {"error": "Analyse incomplète : contrôle manuel des sources nécessaire. "
                        "Le rappel reste enregistré sans acquittement."}
            store.save_snapshot(board)
            return {"due": store.due_reminders()[:10]}

        self.reminder_root = root
        self.reminder_job = self.executor.submit(verify_due)
        self.after(100, self.check_due_job)

    def check_due_job(self) -> None:
        if not self.reminder_job:
            return
        if not self.reminder_job.done():
            self.after(100, self.check_due_job)
            return
        try:
            result = self.reminder_job.result()
            if self.root_directory.get() != self.reminder_root:
                return
            if result.get("error"):
                messagebox.showwarning("Rappel à revérifier", result["error"])
                return
            due = result.get("due") or []
            if not due:
                return
            # The alert is shown only after a fresh, complete re-analysis.
            messagebox.showinfo(
                "Rappels AURA à vérifier",
                "\\n".join(
                    f"{entry['title']} — {entry['due_at']} ({entry['task_id']})"
                    for entry in due
                ),
            )
            from .admin_durable import DurableReviews, local_db_path
            store = DurableReviews(local_db_path(Path(self.reminder_root)))
            for item in due:
                store.acknowledge_reminder(item["id"])
            self.append(f"AURA : {len(due)} rappel(s) revérifié(s), affiché(s) et acquitté(s).")
        except Exception as exc:
            messagebox.showerror("Rappels AURA", f"{type(exc).__name__}: {exc}")
        finally:
            self.reminder_job = None

    def close(self) -> None:
        self.executor.shutdown(wait=False, cancel_futures=True)
        self.destroy()


def main() -> None:
    app = AdministrativeDesktop()
    app.mainloop()


if __name__ == "__main__":
    main()
