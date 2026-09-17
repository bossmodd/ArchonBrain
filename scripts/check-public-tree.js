import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const findings = [];
const textExtensions = /\.(?:js|mjs|c|py|css|html|json|md|txt|ya?ml|toml)$/i;
const rules = [
  ['non-English Hangul text', /[\uac00-\ud7a3]/u],
  ['personal absolute path', /\/(?:Users|home)\/[^/\s]+\//],
  ['temporary attachment path', /\/(?:var\/folders|tmp\/codex|private\/var\/folders)\//],
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['GitHub credential', /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/],
  ['cloud access key', /AKIA[0-9A-Z]{16}/],
];
for (const file of files) {
  if (/^\.env(?:\.|$)/.test(file) && file !== '.env.example') findings.push(`${file}: environment file`);
  if (statSync(file).size >= 100 * 1024 * 1024) findings.push(`${file}: exceeds 100 MiB`);
  if (!textExtensions.test(file)) continue;
  const text = readFileSync(file, 'utf8');
  for (const [label, pattern] of rules) {
    const match = pattern.exec(text);
    if (match) findings.push(`${file}:${text.slice(0, match.index).split('\n').length}: ${label}`);
  }
}
if (findings.length) {
  console.error(findings.join('\n')); process.exitCode = 1;
} else console.log(`Public-tree hygiene passed for ${files.length} files. This heuristic scan does not establish asset redistribution rights or prove the absence of all secrets.`);
