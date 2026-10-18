// Measured Canvas text layout. Coordinates and metrics are native output pixels.
// Font availability is a host dependency; capture must await document.fonts.ready.
const DEFAULTS = {width:1080, height:1920, insetX:87, insetY:154, minGap:24};
const PADDING = 16;
const EPSILON = 1e-7;
const finite = value => typeof value === 'number' && Number.isFinite(value);

function measured(ctx, text) {
  const m = ctx.measureText(text);
  const fields = ['width', 'actualBoundingBoxLeft', 'actualBoundingBoxRight',
    'actualBoundingBoxAscent', 'actualBoundingBoxDescent'];
  if (fields.some(key => !finite(m[key]))) throw Error('Canvas actual ink metrics are required');
  const width = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
  if (width <= 0 || m.actualBoundingBoxAscent + m.actualBoundingBoxDescent <= 0)
    throw Error('Text has no measurable visible ink');
  return {advance:m.width, left:m.actualBoundingBoxLeft, right:m.actualBoundingBoxRight,
    ascent:m.actualBoundingBoxAscent, descent:m.actualBoundingBoxDescent, width};
}

function wrap(ctx, text, available) {
  const lines = [];
  for (const paragraph of text.split('\n')) {
    const words = paragraph.trim().split(/\s+/);
    if (!paragraph.trim()) return null;
    let line = '';
    for (const word of words) {
      const wordMetrics = measured(ctx, word);
      if (Math.max(wordMetrics.advance, wordMetrics.width) > available + EPSILON) return null;
      const candidate = line ? `${line} ${word}` : word;
      const metrics = measured(ctx, candidate);
      if (Math.max(metrics.advance, metrics.width) <= available + EPSILON) line = candidate;
      else { lines.push(line); line = word; }
    }
    lines.push(line);
  }
  return lines.length <= 3 ? lines : null;
}

function rectangleGap(a, b) {
  const x = Math.max(a.x - b.x - b.width, b.x - a.x - a.width, 0);
  const y = Math.max(a.y - b.y - b.height, b.y - a.y - a.height, 0);
  const intersects = a.x < b.x+b.width && b.x < a.x+a.width &&
    a.y < b.y+b.height && b.y < a.y+a.height;
  return {distance:Math.hypot(x, y), intersects};
}

/**
 * Layout without moving authored regions. x is region-left; y is padded-box-top.
 * Default font floor is 36px. Explicit minFontSize:28 permits small metadata;
 * all other supplied floors must be >=36px. No glyph/font-size estimates are used.
 * Boxes include ink and 16px padding, and are centered within their maxWidth region.
 */
export function createTextLayout(ctx, items, options={}) {
  const config = {...DEFAULTS, ...options}, errors = [], boxes = [];
  const {width, height, insetX, insetY, minGap} = config;
  const result = {boxes, pass:false, errors, frame:{width,height},
    safeArea:{x:insetX,y:insetY,width:width-2*insetX,height:height-2*insetY},
    minGap, padding:PADDING, maxLines:3,
    metrics:'Canvas actualBoundingBox ink bounds plus padding',
    font:'Arial, host-installed; no font download'};
  if (![width,height,insetX,insetY,minGap].every(finite) ||
      width <= 0 || height <= 0 || insetX < 0 || insetY < 0 || minGap < 0 ||
      2*insetX >= width || 2*insetY >= height) {
    errors.push('Invalid frame, inset or minimum-gap configuration'); return result;
  }
  if (!ctx || typeof ctx.measureText !== 'function' ||
      typeof ctx.save !== 'function' || typeof ctx.restore !== 'function') {
    errors.push('A Canvas 2D context with save/restore and measureText is required'); return result;
  }
  if (!Array.isArray(items) || !items.length) {
    errors.push('At least one text item is required'); return result;
  }
  const ids = new Set();
  ctx.save();
  try {
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    for (const item of items) {
      const id = item?.id;
      if (!item || typeof id !== 'string' || !id || ids.has(id)) {
        errors.push('Each item requires a unique nonempty string id'); continue;
      }
      ids.add(id);
      try {
        if (typeof item.text !== 'string' || !item.text.trim()) throw Error('Nonempty text required');
        if (/[\r\t\u0000-\u0008\u000b-\u001f]/.test(item.text)) throw Error('Unsupported control character in text');
        const fontSize = item.fontSize ?? 52, minFontSize = item.minFontSize ?? 36;
        if (![item.x,item.y,item.maxWidth,fontSize,minFontSize].every(finite) ||
            !Number.isInteger(fontSize) || !Number.isInteger(minFontSize) ||
            fontSize < minFontSize || (minFontSize !== 28 && minFontSize < 36) ||
            item.maxWidth <= PADDING*2) throw Error('Invalid region or font-size bounds');
        if (item.x < insetX-EPSILON || item.y < insetY-EPSILON ||
            item.x+item.maxWidth > width-insetX+EPSILON) throw Error('Authored region crosses safe area');
        const weight = item.fontWeight ?? 600;
        if (!/^(normal|bold|[1-9]00)$/.test(String(weight))) throw Error('Invalid fontWeight');
        let fitted = null;
        for (let size=fontSize; size>=minFontSize; size--) {
          ctx.font = `${weight} ${size}px Arial`;
          const texts = wrap(ctx, item.text.trim(), item.maxWidth-PADDING*2);
          if (!texts) continue;
          const metrics = texts.map(text => measured(ctx,text));
          const lineGap = Math.ceil(size*.18), lines = [];
          let top = item.y+PADDING;
          const center = item.x+item.maxWidth/2;
          for (let i=0; i<texts.length; i++) {
            const m=metrics[i], baselineX=center-(m.right-m.left)/2, baselineY=top+m.ascent;
            lines.push({text:texts[i],baselineX,baselineY,
              ink:{x:baselineX-m.left,y:top,width:m.width,height:m.ascent+m.descent},
              metrics:m});
            top += m.ascent+m.descent+(i<texts.length-1 ? lineGap : 0);
          }
          const inkWidth = Math.max(...metrics.map(m=>m.width));
          const box = {id,text:item.text,x:center-inkWidth/2-PADDING,y:item.y,
            width:inkWidth+PADDING*2,height:top-item.y+PADDING,
            region:{x:item.x,y:item.y,maxWidth:item.maxWidth},
            fontSize:size,minFontSize,fontWeight:weight,font:`${weight} ${size}px Arial`,
            color:item.color ?? '#ffffff',background:item.background ?? null,
            lines,padding:PADDING,lineGap};
          if (box.y+box.height <= height-insetY+EPSILON) { fitted=box; break; }
        }
        if (!fitted) throw Error('Text cannot fit in three lines within safe bounds and declared font floor');
        boxes.push(fitted);
      } catch (error) { errors.push(`${id}: ${error.message}`); }
    }
  } finally { ctx.restore(); }
  for (let i=0; i<boxes.length; i++) for (let j=i+1; j<boxes.length; j++) {
    const gap=rectangleGap(boxes[i],boxes[j]);
    if (gap.intersects || gap.distance+EPSILON<minGap)
      errors.push(`${boxes[i].id}/${boxes[j].id}: ${gap.intersects?'overlap':'insufficient gap'} (${gap.distance.toFixed(3)}px; minimum ${minGap}px)`);
  }
  result.pass = errors.length === 0 && boxes.length === items.length;
  return result;
}

/** Draw only a passing measured layout, using precisely the measured baselines. */
export function drawTextLayout(ctx, layout) {
  if (!layout?.pass) throw Error('Refusing to draw a failing text layout');
  ctx.save();
  try {
    ctx.textAlign='left';ctx.textBaseline='alphabetic';
    for (const box of layout.boxes) {
      if (box.background) { ctx.fillStyle=box.background;ctx.fillRect(box.x,box.y,box.width,box.height); }
      ctx.font=box.font;ctx.fillStyle=box.color;
      for (const line of box.lines) ctx.fillText(line.text,line.baselineX,line.baselineY);
    }
  } finally { ctx.restore(); }
  return layout;
}
