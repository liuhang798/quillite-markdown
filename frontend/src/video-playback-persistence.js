// Both trees have already been through the document sanitizer and video
// preparation. The pair must come from the video controller's private state,
// never from selectors that an authored document could impersonate.
export function reconcileVideoPlayback(container, fragment, pair) {
  const { current, next } = pair || {};
  if (!container?.isConnected || fragment?.nodeType !== 11 || !current?.isConnected ||
      !container.contains(current) || !next || !fragment.contains(next)) return false;

  // Plan before touching either tree. A node detached even briefly can pause
  // its media element in WebKit. Keep the card and its entire ancestor path
  // connected, and replace only the ordinary rendered siblings.
  const frames = [];
  for (let oldNode = current, newNode = next; ; ) {
    const oldParent = oldNode.parentNode;
    const newParent = newNode.parentNode;
    if (!oldParent || !newParent) return false;
    const atRoot = oldParent === container && newParent === fragment;
    if (!atRoot && (oldParent === container || newParent === fragment ||
        oldParent.nodeType !== 1 || newParent.nodeType !== 1 ||
        oldParent.namespaceURI !== 'http://www.w3.org/1999/xhtml' ||
        oldParent.namespaceURI !== newParent.namespaceURI || oldParent.localName !== newParent.localName ||
        // The table layout pass can wrap and reparent a table after mounting.
        oldParent.localName === 'table')) return false;
    frames.push({ oldNode, newNode, oldParent, newParent, atRoot });
    if (atRoot) break;
    oldNode = oldParent;
    newNode = newParent;
  }

  // This is a new source mapping even though playback itself is unchanged.
  // The normal renderer validates this temporary marker after reconciliation.
  current.removeAttribute('data-line');
  const anchor = next.getAttribute('data-qm-source');
  if (anchor === null) current.removeAttribute('data-qm-source');
  else current.setAttribute('data-qm-source', anchor);

  for (const { oldNode, newNode, oldParent, newParent, atRoot } of frames) {
    if (!atRoot) syncContainerAttributes(oldParent, newParent);
    while (oldParent.firstChild !== oldNode) oldParent.firstChild.remove();
    while (oldParent.lastChild !== oldNode) oldParent.lastChild.remove();
    const doc = oldParent.ownerDocument;
    const before = doc.createDocumentFragment(), after = doc.createDocumentFragment();
    while (newParent.firstChild !== newNode) before.append(newParent.firstChild);
    while (newNode.nextSibling) after.append(newNode.nextSibling);
    oldParent.insertBefore(before, oldNode);
    oldParent.append(after);
  }
  return true;
}

function syncContainerAttributes(current, next) {
  // Keep an expanded disclosure open while a video within it is playing.
  const isUserState = name => current.localName === 'details' && name === 'open';
  for (const name of current.getAttributeNames()) {
    if (!isUserState(name) && !next.hasAttribute(name)) current.removeAttribute(name);
  }
  for (const { name, value } of next.attributes) {
    if (!isUserState(name) && current.getAttribute(name) !== value) current.setAttribute(name, value);
  }
}
