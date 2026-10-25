"""AURA administrative desktop UI (local-only, no network or model).

Tkinter is part of standard Windows Python installations. All I/O runs
in a background thread; GUI elements are only touched on the UI thread.
"""
from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox, scrolledtext, ttk

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
            return {"mode": "diagnostic", "personal": first,
                    "administrative": second, "pdf": third, "portfolio": fourth}

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
                first, second, third, fourth = (
                    result["personal"], result["administrative"],
                    result["pdf"], result["portfolio"]
                )
                suites = (first, second, third, fourth)
                passed = sum(int(x.get("checks_passed", 0)) for x in suites)
                total = sum(int(x.get("checks_total", 0)) for x in suites)
                verified = (
                    all(x.get("ok") is True for x in suites)
                    and total == 43 and passed == total
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

    def close(self) -> None:
        self.executor.shutdown(wait=False, cancel_futures=True)
        self.destroy()


def main() -> None:
    app = AdministrativeDesktop()
    app.mainloop()


if __name__ == "__main__":
    main()
