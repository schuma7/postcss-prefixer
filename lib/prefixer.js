const path = require("path");
const Tokenizer = require("css-selector-tokenizer");
const { parseAttrSelector, attrStringify, itMatchesOne } = require("./utils");

const prefixNode = (node, prefix) => {
  if (["class", "id"].includes(node.type)) {
    return Object.assign({}, node, { name: `${prefix}${node.name}` });
  }

  if (["attribute"].includes(node.type) && node.content) {
    const { type, operator, head, classes, foot } = parseAttrSelector(node);

    if (!["class", "id"].includes(type)) return node;

    return Object.assign({}, node, {
      content: attrStringify({
        type,
        operator,
        head,
        classes: classes.map((cls) => `${prefix}${cls}`),
        foot,
      }),
    });
  }

  return node;
};

function fixMissingBackslashes(originalInput, parsedInput, prefix) {
  const correctedInput = [];
  let parsedIndex = prefix.length;
  let originalIndex = 0;

  while (parsedIndex < parsedInput.length) {
    const originalChar = originalInput[originalIndex];

    if (
      originalChar === "\\" &&
      originalInput.slice(originalIndex, originalIndex + 3) === "\\2c"
    ) {
      if (parsedInput.slice(parsedIndex, parsedIndex + 2) === "2c") {
        correctedInput.push("\\2c");
        parsedIndex += 2;
        originalIndex += 3;
        // eslint-disable-next-line no-continue
        continue;
      }
    }

    correctedInput.push(parsedInput[parsedIndex]);
    parsedIndex += 1;
    originalIndex += 1;
  }

  return "." + prefix.slice(0, -1) + correctedInput.join("");
}

const interateSelectorNodes = (selector, options) =>
  Object.assign({}, selector, {
    nodes: selector.nodes.map((node) => {
      if (["selector", "nested-pseudo-class"].includes(node.type)) {
        return interateSelectorNodes(node, options);
      }

      if (itMatchesOne(options.ignore, Tokenizer.stringify(node))) return node;

      return prefixNode(node, options.prefix);
    }),
  });

const prefixer = (options) => {
  const { prefix, ignore } = Object.assign(
    {},
    {
      prefix: "",
      ignore: [],
    },
    options
  );

  if (typeof prefix !== "string") {
    throw new Error("@postcss-prefix: prefix option should be of type string.");
  }

  if (!Array.isArray(ignore)) {
    throw new Error("@postcss-prefix: ignore options should be an Array.");
  }

  return {
    postcssPlugin: "postcss-prefixer",
    Once(css) {
      if (!prefix.length) return;

      const srcDirectory = path.join(process.cwd(), "src");

      /* comment this out for running the tests => */
      const cssNormalizedPath = path.normalize(css.source.input.file);

      if (!cssNormalizedPath.startsWith(srcDirectory)) {
        return;
      }
      /* <= comment this out for running the tests */

      css.walkRules((rule) => {
        const parsed = Tokenizer.parse(rule.selector);
        const selector = interateSelectorNodes(parsed, { prefix, ignore });

        const stringified = Tokenizer.stringify(selector);

        /* The Tokenizer mishandles escaped commas (\2c) in complex CSS rules, therefore we insert the backslashes which are in the original but not the parsed output */
        if (rule.selector.includes("2c")) {
          /* eslint no-param-reassign: "off" */
          rule.selector = fixMissingBackslashes(
            rule.selector,
            stringified,
            prefix
          );
        } else {
          /* eslint no-param-reassign: "off" */
          rule.selector = stringified;
        }
      });
    },
  };
};

prefixer.postcss = true;

module.exports = prefixer;
