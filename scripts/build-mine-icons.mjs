import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { mineGlyphs } from "../web/src/components/mine-glyphs.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "server/public/static/miniprogram/account-v2");
const staging = mkdtempSync(join(tmpdir(), "outdoor-account-icons-"));
const variants = { "": "#242229", "-dark": "#eeeaf4", "-purple": "#5b3b8c" };
mkdirSync(output, { recursive: true });
try {
  for (const [name, paths] of Object.entries(mineGlyphs)) {
    for (const [suffix, color] of Object.entries(variants)) {
      const input = join(staging, `${name}${suffix}.svg`);
      writeFileSync(input, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" color="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`);
      const result = spawnSync("rsvg-convert", ["--width", "96", "--height", "96", "--output", join(output, `${name}${suffix}.png`), input], { encoding: "utf8" });
      if (result.error || result.status !== 0) throw result.error || new Error(result.stderr || "rsvg-convert failed");
    }
  }
  console.log(`Generated ${Object.keys(mineGlyphs).length * Object.keys(variants).length} account icons.`);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
