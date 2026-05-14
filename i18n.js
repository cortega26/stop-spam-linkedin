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

  /* Fallback: walk all elements and check child text nodes directly.
     Catches text inside display:none elements that TreeWalker may skip. */
  function localizeAllNodeValues() {
    const elements = documentRef.querySelectorAll("*");
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      const tag = el.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") continue;
      const children = el.childNodes;
      for (let j = 0; j < children.length; j++) {
        const child = children[j];
        if (child.nodeType === 3 && child.nodeValue.includes("__MSG_")) {
          const nextValue = replaceTokens(child.nodeValue);
          if (nextValue !== child.nodeValue) {
            child.nodeValue = nextValue;
          }
        }
      }
    }
  }

  documentRef.title = replaceTokens(documentRef.title);
  localizeTextNodes();
  localizeAttributes();
  localizeAllNodeValues();
})();