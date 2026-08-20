/**
 * Rewrites the quote card in `README.md`, run daily by
 * `.github/workflows/update-quote.yml`.
 *
 * ES module, not CommonJS: this repo's `package.json` carries `"type": "module"`
 * for the Next.js site that now lives alongside the profile README, which makes
 * `require` a hard `ReferenceError` in any `.js` file here. The script's only
 * dependency is `fs`, so nothing else had to change.
 *
 * The regex is anchored on the two HTML comment markers in `README.md`. Edit the
 * README freely, but keep that pair.
 */
import fs from 'node:fs';

const README_PATH = new URL('./README.md', import.meta.url);
const QUOTES_PATH = new URL('./quotes.json', import.meta.url);
const CARD_BLOCK = /<!--STARTS_HERE_QUOTE_CARD-->(.|\n)*<!--ENDS_HERE_QUOTE_CARD-->/;

function updateQuote() {
  const quotes = JSON.parse(fs.readFileSync(QUOTES_PATH, 'utf-8'));
  const { quote, author } = quotes[Math.floor(Math.random() * quotes.length)];

  // Palette matches the portfolio site and the rest of this README: #060607
  // ground, #f2f0eb ink, #8d8d88 dim. The card's own defaults are purple and
  // gold, which would be the only colour anywhere on the page.
  const cardDesign = `
<!--STARTS_HERE_QUOTE_CARD-->
<p align="center">
    <img src="https://readme-daily-quotes.vercel.app/api?author=${encodeURIComponent(author)}&quote=${encodeURIComponent(quote)}&theme=dark&bg_color=060607&author_color=8d8d88&accent_color=f2f0eb" alt="Quote of the day">
</p>
<!--ENDS_HERE_QUOTE_CARD-->
`;

  const readme = fs.readFileSync(README_PATH, 'utf-8');

  // Without this the replace is a silent no-op and the workflow goes green having
  // changed nothing. A missing marker is a README edit to fix, not a flake.
  if (!CARD_BLOCK.test(readme)) {
    throw new Error('README.md has no <!--STARTS_HERE_QUOTE_CARD--> … <!--ENDS_HERE_QUOTE_CARD--> block');
  }

  fs.writeFileSync(README_PATH, readme.replace(CARD_BLOCK, cardDesign));
}

try {
  updateQuote();
} catch (error) {
  console.error('Error updating quote:', error);
  process.exitCode = 1;
}
