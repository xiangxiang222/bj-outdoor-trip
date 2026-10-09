const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const dir = path.join(__dirname, "../public/static/activities");

const scenes = {
  "guandan.png": `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
    <rect width="640" height="640" fill="#243528"/>
    <circle cx="320" cy="340" r="250" fill="#2f6a45"/>
    <ellipse cx="320" cy="360" rx="210" ry="150" fill="#1e4d32"/>
    <g transform="translate(210 168) rotate(-18)">
      <rect width="118" height="168" rx="14" fill="#f7f3eb" stroke="#d9d3c4" stroke-width="4"/>
      <circle cx="59" cy="84" r="18" fill="#c6f24a"/>
    </g>
    <g transform="translate(268 150) rotate(8)">
      <rect width="118" height="168" rx="14" fill="#fffdf8" stroke="#d9d3c4" stroke-width="4"/>
      <rect x="42" y="62" width="34" height="44" rx="6" fill="#bc4749"/>
    </g>
    <g transform="translate(330 176) rotate(22)">
      <rect width="118" height="168" rx="14" fill="#f4f1ea" stroke="#d9d3c4" stroke-width="4"/>
      <circle cx="59" cy="84" r="16" fill="#2d6a4f"/>
    </g>
    <circle cx="150" cy="120" r="36" fill="#ffd166" opacity="0.85"/>
  </svg>`,
  "run.png": `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
    <rect width="640" height="640" fill="#1b3a4b"/>
    <circle cx="470" cy="110" r="54" fill="#ffd166"/>
    <rect y="360" width="640" height="280" fill="#2d6a4f"/>
    <path d="M40 470 C180 430 260 520 400 470 C500 436 560 490 640 450 L640 640 L0 640 Z" fill="#c6f24a" opacity="0.35"/>
    <path d="M80 520 C200 470 300 560 460 510 C540 486 590 530 640 500" fill="none" stroke="#f7f3eb" stroke-width="28" stroke-linecap="round"/>
    <circle cx="120" cy="300" r="46" fill="#1b4332"/>
    <rect x="108" y="300" width="24" height="90" rx="10" fill="#1b4332"/>
    <circle cx="430" cy="250" r="58" fill="#1b4332"/>
    <rect x="414" y="250" width="30" height="110" rx="12" fill="#1b4332"/>
    <g transform="translate(230 390)">
      <circle cx="28" cy="18" r="16" fill="#f4f1ea"/>
      <path d="M10 40 L46 28 L78 58" fill="none" stroke="#f7f3eb" stroke-width="12" stroke-linecap="round"/>
      <path d="M40 48 L24 86 M48 50 L70 84" fill="none" stroke="#c6f24a" stroke-width="10" stroke-linecap="round"/>
    </g>
    <g transform="translate(360 360)">
      <circle cx="24" cy="16" r="15" fill="#f4f1ea"/>
      <path d="M8 36 L40 24 L70 52" fill="none" stroke="#fffdf8" stroke-width="12" stroke-linecap="round"/>
      <path d="M34 44 L18 82 M46 46 L66 80" fill="none" stroke="#ffd166" stroke-width="10" stroke-linecap="round"/>
    </g>
  </svg>`,
  "movie.png": `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
    <rect width="640" height="640" fill="#1a1c24"/>
    <rect x="70" y="70" width="500" height="230" rx="18" fill="#f7f1df"/>
    <rect x="90" y="90" width="460" height="190" rx="8" fill="#ffd166" opacity="0.9"/>
    <circle cx="180" cy="160" r="28" fill="#f4a261"/>
    <path d="M250 210 C310 150 390 150 460 200" fill="none" stroke="#fff" stroke-width="10" opacity="0.7"/>
    <g fill="#243028">
      <rect x="80" y="360" width="150" height="70" rx="16"/>
      <rect x="245" y="360" width="150" height="70" rx="16"/>
      <rect x="410" y="360" width="150" height="70" rx="16"/>
      <rect x="120" y="460" width="150" height="78" rx="16"/>
      <rect x="290" y="460" width="150" height="78" rx="16"/>
      <rect x="460" y="460" width="120" height="78" rx="16"/>
    </g>
    <circle cx="320" cy="392" r="14" fill="#c6f24a"/>
    <circle cx="365" cy="392" r="14" fill="#f4f1ea"/>
  </svg>`,
  "recruit.png": `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
    <rect width="640" height="640" fill="#f4f1ea"/>
    <rect x="0" y="390" width="640" height="250" fill="#e7e1d4"/>
    <rect x="70" y="80" width="220" height="180" rx="12" fill="#d7efe8"/>
    <rect x="360" y="120" width="200" height="250" rx="16" fill="#fffdf8" stroke="#d9d3c4" stroke-width="6"/>
    <rect x="390" y="160" width="140" height="14" rx="7" fill="#e6e4dc"/>
    <rect x="390" y="192" width="110" height="14" rx="7" fill="#e6e4dc"/>
    <rect x="390" y="224" width="90" height="14" rx="7" fill="#c6f24a"/>
    <g transform="translate(70 250)">
      <path d="M40 80 L150 40 L150 150 L40 120 Z" fill="#2d6a4f"/>
      <rect x="150" y="58" width="70" height="74" rx="8" fill="#1b4332"/>
      <circle cx="188" cy="95" r="16" fill="#c6f24a"/>
      <path d="M20 70 C0 90 0 120 24 132" fill="none" stroke="#bc4749" stroke-width="10" stroke-linecap="round"/>
    </g>
  </svg>`,
  "city.png": `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
    <rect width="640" height="640" fill="#2c3330"/>
    <rect x="40" y="80" width="250" height="320" fill="#6b4f3a"/>
    <rect x="350" y="40" width="240" height="380" fill="#5c4636"/>
    <rect x="70" y="120" width="70" height="90" fill="#ffd166" opacity="0.85"/>
    <rect x="170" y="120" width="70" height="90" fill="#f4f1ea" opacity="0.35"/>
    <rect x="400" y="100" width="64" height="80" fill="#ffd166" opacity="0.55"/>
    <rect x="490" y="100" width="64" height="80" fill="#f7f3eb" opacity="0.3"/>
    <circle cx="320" cy="150" r="28" fill="#bc4749"/>
    <rect x="308" y="178" width="24" height="70" fill="#6b4f3a"/>
    <ellipse cx="320" cy="470" rx="150" ry="36" fill="#1b4332"/>
    <circle cx="250" cy="430" r="16" fill="#f4f1ea"/>
    <circle cx="390" cy="430" r="16" fill="#c6f24a"/>
    <rect y="500" width="640" height="140" fill="#3d4a3a"/>
  </svg>`,
};

async function main() {
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, svg] of Object.entries(scenes)) {
    const dest = path.join(dir, name);
    await sharp(Buffer.from(svg)).resize(640, 640).png().toFile(dest);
    const size = fs.statSync(dest).size;
    if (size < 1000) throw new Error(`${name} too small: ${size}`);
    console.log(name, size);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
