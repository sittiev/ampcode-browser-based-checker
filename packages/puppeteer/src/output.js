const fs = require("fs");
const path = require("path");

function ensure(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function append(filePath, text) {
  const dir = path.dirname(filePath);
  ensure(dir);
  fs.appendFileSync(filePath, text + "\n", "utf8");
}

function writeGrouped(outputDir, results) {
  ensure(outputDir);

  const statuses = ["valid", "wrong", "blocked", "broken", "errors"];
  for (const s of statuses) {
    const p = path.join(outputDir, `${s}.txt`);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  const valuableFile = path.join(outputDir, "valuable.txt");
  if (fs.existsSync(valuableFile)) fs.unlinkSync(valuableFile);

  for (const r of results) {
    let file;
    switch (r.status) {
      case "OK":
        file = r.valuable ? "valuable.txt" : "valid.txt";
        break;
      case "WRONG": file = "wrong.txt"; break;
      case "BLOCKED": file = "blocked.txt"; break;
      case "BROKEN": file = "broken.txt"; break;
      default: file = "errors.txt";
    }

    let line;
    if (r.status === "OK") {
      line = `${r.email}:${r._password || ""} │ Balance: ${r.balance || "$0"} │ TopUp: ${r.topUp || "—"} │ Payment: ${r.payment || "—"}`;
    } else {
      line = `${r.email}:${r._password || ""} │ ${r.error || r.status}`;
    }
    append(path.join(outputDir, file), line);
  }
}

function writeSummary(outputDir, total, stats, elapsed) {
  ensure(outputDir);
  const lines = [
    `Checked  : ${total}`,
    `Elapsed  : ${elapsed}s`,
    `CPM      : ${Math.round((total / (parseFloat(elapsed) || 0.1)) * 60)}`,
    `OK       : ${stats.ok}`,
    `WRONG    : ${stats.wrong}`,
    `BLOCKED  : ${stats.blocked}`,
    `BROKEN   : ${stats.broken}`,
    `ERRORS   : ${stats.err}`,
    `VALUABLE : ${stats.valuable}`,
  ];
  fs.writeFileSync(path.join(outputDir, "summary.txt"), lines.join("\n"), "utf8");
}

module.exports = { ensure, writeGrouped, writeSummary };
