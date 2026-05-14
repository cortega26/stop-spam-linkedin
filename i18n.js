(function () {
  "use strict";

  const documentRef = globalThis.document;
  const chromeApi = globalThis.chrome;
  const nodeFilter = globalThis.NodeFilter;
  const tokenRegex = /__MSG_([A-Za-z0-9_@]+?)__/g;
  const attributeNames = ["placeholder", "title", "aria-label", "alt", "value"];

  if (!documentRef || !chromeApi?.i18n || !nodeFilter) return;

  function replaceTokens(value) {
    if (!value || !value.includes("__MSG_")) return value;

    return value.replace(tokenRegex, (match, key) => {
      return chromeApi.i18n.getMessage(key) || match;
    });
  }

  function localizeTextNodes() {
    const walker = documentRef.createTreeWalker(
      documentRef.documentElement,
      nodeFilter.SHOW_TEXT
    );

    let currentNode = walker.nextNode();
    while (currentNode) {
      const parentTagName = currentNode.parentElement?.tagName;
      if (parentTagName !== "SCRIPT" && parentTagName !== "STYLE") {
        const nextValue = replaceTokens(currentNode.nodeValue);
        if (nextValue !== currentNode.nodeValue) {
          currentNode.nodeValue = nextValue;
        }
      }
      currentNode = walker.nextNode();
    }
  }

  function localizeAttributes() {
    const elements = documentRef.querySelectorAll("*");
    elements.forEach((element) => {
      attributeNames.forEach((attributeName) => {
        if (!element.hasAttribute(attributeName)) return;

        const currentValue = element.getAttribute(attributeName);
        const nextValue = replaceTokens(currentValue);
        if (nextValue !== currentValue) {
          element.setAttribute(attributeName, nextValue);
        }
      });
    });
  }

  documentRef.title = replaceTokens(documentRef.title);
  localizeTextNodes();
  localizeAttributes();
})();