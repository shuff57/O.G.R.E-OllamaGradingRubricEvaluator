/**
 * dom-snapshot.ts — Smart DOM cleanup engine (T8) with bounding box support (T9)
 *
 * Exports:
 *  - smartWalk(root, options?)       — walk a live DOM element, return cleaned SnapshotResult
 *  - buildSmartWalkScript(options?)  — return a self-contained browser JS string for CDP injection
 */

import type {
  SnapshotNode,
  SnapshotOptions,
  SnapshotResult,
  SnapshotMetadata,
  BoundingBox,
} from './dom-snapshot-types';
import { classifyNodePriority } from './dom-snapshot-types';

// ============================================================================
// Constants
// ============================================================================

/** Attribute names always captured on every node. */
const DEFAULT_CAPTURE_ATTRS: readonly string[] = [
  'id', 'class', 'name', 'type',
  'data-lastchange', 'data-student', 'data-score', 'data-response', 'data-gradable',
  'aria-label', 'role', 'href', 'src', 'contenteditable', 'placeholder',
];

// ============================================================================
// Option resolution
// ============================================================================

function resolveOptions(partial?: Partial<SnapshotOptions>): Required<SnapshotOptions> {
  return {
    maxDepth: partial?.maxDepth ?? 8,
    maxNodes: partial?.maxNodes ?? 500,
    maxTextLength: partial?.maxTextLength ?? 150,
    rootSelector: partial?.rootSelector ?? 'body',
    captureBoundingBoxes: partial?.captureBoundingBoxes ?? false,
    skipHidden: partial?.skipHidden ?? true,
    extraAttrs: partial?.extraAttrs ?? [],
    charBudget: partial?.charBudget ?? 12000,
  };
}

// ============================================================================
// smartWalk
// ============================================================================

export function smartWalk(
  root: Element,
  options?: Partial<SnapshotOptions>,
): SnapshotResult {
  const opts = resolveOptions(options);
  const allNodes: SnapshotNode[] = [];
  let totalVisited = 0;

  const captureAttrSet = new Set<string>([...DEFAULT_CAPTURE_ATTRS, ...opts.extraAttrs]);

  // ── helpers ──────────────────────────────────────────────────────────

  function captureAttrs(el: Element): Record<string, string> {
    const out: Record<string, string> = {};
    for (let i = 0; i < el.attributes.length; i++) {
      const a = el.attributes[i];
      if (captureAttrSet.has(a.name)) {
        out[a.name] = a.value;
      }
    }
    return out;
  }

  function getDirectText(el: Element): string | undefined {
    let raw = '';
    for (let i = 0; i < el.childNodes.length; i++) {
      const c = el.childNodes[i];
      if (c.nodeType === 3) raw += c.textContent ?? '';
    }
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    return trimmed.length > opts.maxTextLength
      ? trimmed.slice(0, opts.maxTextLength)
      : trimmed;
  }

  function hasDirectTextContent(el: Element): boolean {
    for (let i = 0; i < el.childNodes.length; i++) {
      const c = el.childNodes[i];
      if (c.nodeType === 3 && (c.textContent ?? '').trim()) return true;
    }
    return false;
  }

  /** Wrapper collapsing predicate: div/span with NO attrs, NO text, exactly 1 child element. */
  function isCollapsible(el: Element): boolean {
    const tag = el.tagName.toLowerCase();
    if (tag !== 'div' && tag !== 'span') return false;
    if (el.attributes.length > 0) return false;
    if (el.children.length !== 1) return false;
    return !hasDirectTextContent(el);
  }

  function isHiddenElement(el: Element): boolean {
    if (!(el instanceof HTMLElement)) return false;
    return el.offsetWidth === 0 && el.offsetHeight === 0;
  }

  function selectorSegment(el: Element): string {
    const tag = el.tagName.toLowerCase();
    if (el.id) return `${tag}#${el.id}`;
    if (el.className && typeof el.className === 'string') {
      const first = el.className.trim().split(/\s+/)[0];
      if (first) return `${tag}.${first}`;
    }
    return tag;
  }

  function buildSelector(el: Element, parentSel: string): string {
    const seg = selectorSegment(el);
    return parentSel ? `${parentSel} > ${seg}` : seg;
  }

  function captureBbox(el: Element): BoundingBox {
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: Math.round(r.width),
      height: Math.round(r.height),
      visible: r.width > 0 && r.height > 0,
    };
  }

  // ── recursive walk ───────────────────────────────────────────────────

  function walk(el: Element, depth: number, parentSel: string, isRoot: boolean): void {
    if (depth > opts.maxDepth) return;
    totalVisited++;

    // Visibility filtering (never skip root)
    if (!isRoot && opts.skipHidden && isHiddenElement(el)) return;

    // Wrapper collapsing (recursive — skip wrapper, walk its single child at same depth)
    if (!isRoot && isCollapsible(el)) {
      walk(el.children[0], depth, parentSel, false);
      return;
    }

    const tag = el.tagName.toLowerCase();
    const attrs = captureAttrs(el);
    const text = getDirectText(el);
    const hasText = text !== undefined;
    const childElements = Array.from(el.children);
    const priority = classifyNodePriority(tag, attrs, hasText, childElements.length);
    const selector = buildSelector(el, parentSel);

    const node: SnapshotNode = { tag, depth, priority, attrs };
    if (text) node.text = text;
    node.selector = selector;
    if (opts.captureBoundingBoxes) node.bbox = captureBbox(el);

    allNodes.push(node);

    // ── sibling deduplication ────────────────────────────────────────
    let i = 0;
    while (i < childElements.length) {
      const groupTag = childElements[i].tagName;
      let j = i + 1;
      while (j < childElements.length && childElements[j].tagName === groupTag) j++;
      const groupLen = j - i;

      if (groupLen >= 3) {
        // Keep first 3, record total on parent
        node.attrs.repeatedSiblings = String(groupLen);
        for (let k = i; k < i + 3; k++) {
          walk(childElements[k], depth + 1, selector, false);
        }
      } else {
        for (let k = i; k < j; k++) {
          walk(childElements[k], depth + 1, selector, false);
        }
      }
      i = j;
    }
  }

  walk(root, 0, '', true);

  // ── priority-based budget trimming ─────────────────────────────────
  const nodeCountBeforeTrim = allNodes.length;

  if (allNodes.length > opts.maxNodes) {
    const toEvict = allNodes.length - opts.maxNodes;
    const priorityRank: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };
    const indexed = allNodes.map((n, idx) => ({ idx, rank: priorityRank[n.priority] ?? -1 }));
    // Sort ascending by rank so lowest-priority nodes come first
    indexed.sort((a, b) => a.rank - b.rank);

    const evictSet = new Set<number>();
    for (let e = 0; e < toEvict; e++) evictSet.add(indexed[e].idx);

    // Rebuild array preserving original DOM order
    const kept = allNodes.filter((_, idx) => !evictSet.has(idx));
    allNodes.length = 0;
    allNodes.push(...kept);
  }

  // ── metadata ───────────────────────────────────────────────────────
  const charCount = JSON.stringify(allNodes).length;
  const meta: SnapshotMetadata = {
    totalVisited,
    nodesIncluded: allNodes.length,
    nodesDropped: totalVisited - allNodes.length,
    wasTruncated: nodeCountBeforeTrim > opts.maxNodes,
    charCount,
    capturedAt: new Date().toISOString(),
    options: opts,
  };

  return { nodes: allNodes, meta };
}

// ============================================================================
// buildSmartWalkScript
// ============================================================================

/**
 * Return a self-contained browser JavaScript string (IIFE) that performs the
 * same walk algorithm.  The string is safe for CDP `Runtime.evaluate` — it
 * contains zero `import` / `require` statements and no TypeScript syntax.
 */
export function buildSmartWalkScript(options?: Partial<SnapshotOptions>): string {
  const opts = resolveOptions(options);
  const optsJson = JSON.stringify(opts);
  const defaultAttrsJson = JSON.stringify(DEFAULT_CAPTURE_ATTRS);

  /* eslint-disable no-useless-escape */
  return `(function(){
var opts=${optsJson};
var DEFAULT_ATTRS=${defaultAttrsJson};
var LOW_TAGS=["script","style","noscript","meta","link","head","svg","path","g","defs","symbol"];
var HIGH_TAGS=["form","input","textarea","select","button","table","tr","td","th"];
var CRIT_ATTRS=["data-lastchange","data-student","data-score","data-response","data-gradable"];
var lowSet={};LOW_TAGS.forEach(function(t){lowSet[t]=1;});
var highSet={};HIGH_TAGS.forEach(function(t){highSet[t]=1;});
var critSet={};CRIT_ATTRS.forEach(function(t){critSet[t]=1;});
var captureSet={};DEFAULT_ATTRS.concat(opts.extraAttrs||[]).forEach(function(a){captureSet[a]=1;});

function classify(tag,attrs,hasText,cc){
  if(lowSet[tag])return"low";
  for(var k in attrs){if(critSet[k])return"critical";}
  if(tag==="input"){var tp=(attrs.type||"").toLowerCase();if(tp==="hidden")return((attrs.name||"").match(/^fb[-_]/i))?"high":"medium";}
  if(tag==="input"){var tp=(attrs.type||"").toLowerCase();if(tp==="number"||tp==="text"||tp==="")return"critical";}
  if(tag==="textarea")return"critical";
  if(highSet[tag])return"high";
  if(hasText||cc>0)return"medium";
  return"low";
}
function capAttrs(el){
  var o={};for(var i=0;i<el.attributes.length;i++){var a=el.attributes[i];if(captureSet[a.name])o[a.name]=a.value;}return o;
}
function directText(el){
  var t="";for(var i=0;i<el.childNodes.length;i++){var c=el.childNodes[i];if(c.nodeType===3)t+=c.textContent||"";}
  var s=t.trim();if(!s)return void 0;return s.length>opts.maxTextLength?s.slice(0,opts.maxTextLength):s;
}
function hasDirectText(el){
  for(var i=0;i<el.childNodes.length;i++){var c=el.childNodes[i];if(c.nodeType===3&&(c.textContent||"").trim())return true;}return false;
}
function collapsible(el){
  var tg=el.tagName.toLowerCase();if(tg!=="div"&&tg!=="span")return false;
  if(el.attributes.length>0)return false;if(el.children.length!==1)return false;return!hasDirectText(el);
}
function hidden(el){return el.offsetWidth===0&&el.offsetHeight===0;}
function selSeg(el){
  var tg=el.tagName.toLowerCase();if(el.id)return tg+"#"+el.id;
  if(el.className&&typeof el.className==="string"){var f=el.className.trim().split(/\\s+/)[0];if(f)return tg+"."+f;}return tg;
}
function bbox(el){
  var r=el.getBoundingClientRect();
  return{x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height),visible:r.width>0&&r.height>0};
}

var all=[];var visited=0;
function walk(el,d,ps,isR){
  if(d>opts.maxDepth)return;visited++;
  if(!isR&&opts.skipHidden&&hidden(el)){if(!(el.tagName&&el.tagName.toLowerCase()==="input"&&el.getAttribute("type")==="hidden"))return;}
  if(!isR&&collapsible(el)){walk(el.children[0],d,ps,false);return;}
  var tag=el.tagName.toLowerCase();var at=capAttrs(el);var tx=directText(el);var ht=tx!==void 0;
  var ch=Array.prototype.slice.call(el.children);var pr=classify(tag,at,ht,ch.length);
  var sel=ps?ps+" > "+selSeg(el):selSeg(el);
  var nd={tag:tag,depth:d,priority:pr,attrs:at};if(tx)nd.text=tx;nd.selector=sel;
  if(opts.captureBoundingBoxes)nd.bbox=bbox(el);
  all.push(nd);
  var i=0;while(i<ch.length){var gt=ch[i].tagName;var j=i+1;while(j<ch.length&&ch[j].tagName===gt)j++;
    var gl=j-i;if(gl>=3){nd.attrs.repeatedSiblings=String(gl);for(var k=i;k<i+3;k++)walk(ch[k],d+1,sel,false);}
    else{for(var k2=i;k2<j;k2++)walk(ch[k2],d+1,sel,false);}i=j;}
}

var root=document.querySelector(opts.rootSelector)||document.body;
walk(root,0,"",true);
var bcnt=all.length;
if(all.length>opts.maxNodes){
  var toE=all.length-opts.maxNodes;var pr2={low:0,medium:1,high:2,critical:3};
  var ix=all.map(function(n,i){return{i:i,r:pr2[n.priority]||0};});
  ix.sort(function(a,b){return a.r-b.r;});var es={};for(var e=0;e<toE;e++)es[ix[e].i]=1;
  all=all.filter(function(_,i){return!es[i];});
}
var cc=JSON.stringify(all).length;
return{nodes:all,meta:{totalVisited:visited,nodesIncluded:all.length,nodesDropped:visited-all.length,
  wasTruncated:bcnt>opts.maxNodes,charCount:cc,capturedAt:new Date().toISOString(),options:opts}};
})()`;
  /* eslint-enable no-useless-escape */
}
