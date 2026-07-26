// Casas da 6\u00AA para a 1\u00AA corda. x = n\u00E3o tocar, 0 = corda solta.
const SHAPES = {
  C:["x",3,2,0,1,0], D:["x","x",0,2,3,2], E:[0,2,2,1,0,0],
  F:[1,3,3,2,1,1], G:[3,2,0,0,0,3], A:["x",0,2,2,2,0],
  B:["x",2,4,4,4,2], Am:["x",0,2,2,1,0], Bm:["x",2,4,4,3,2],
  Cm:["x",3,5,5,4,3], Dm:["x","x",0,2,3,1], Em:[0,2,2,0,0,0],
  Fm:[1,3,3,1,1,1], Gm:[3,5,5,3,3,3],
  C7:["x",3,2,3,1,0], D7:["x","x",0,2,1,2], E7:[0,2,0,1,0,0],
  G7:[3,2,0,0,0,1], A7:["x",0,2,0,2,0], B7:["x",2,1,2,0,2],
  Cmaj7:["x",3,2,0,0,0], Dmaj7:["x","x",0,2,2,2],
  Emaj7:[0,2,1,1,0,0], Fmaj7:["x","x",3,2,1,0],
  Gmaj7:[3,2,0,0,0,2], Amaj7:["x",0,2,1,2,0],
  Am7:["x",0,2,0,1,0], Bm7:["x",2,4,2,3,2], Dm7:["x","x",0,2,1,1],
  Em7:[0,2,0,0,0,0]
};

function normalize(chord) {
  return chord.split("/")[0]
    .replace("\u266F","#").replace("\u266D","b")
    .replace(/sus\d?|add\d+|dim|aug|\([^)]*\)/g,"");
}

export function getChordShape(chord) {
  const clean = normalize(chord);
  return SHAPES[clean] || null;
}

export function drawChordDiagram(chord) {
  const shape = getChordShape(chord);
  if (!shape) return `<div class="empty">Diagrama ainda n\u00E3o cadastrado para <strong>${chord}</strong>.<br>O acorde continua funcionando na transposi\u00E7\u00E3o.</div>`;
  const strings = 6, frets = 5, w=260, h=210, left=35, top=45, gapX=36, gapY=29;
  let svg = `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="Diagrama do acorde ${chord}">`;
  for(let i=0;i<strings;i++){
    const x=left+i*gapX;
    svg += `<line x1="${x}" y1="${top}" x2="${x}" y2="${top+frets*gapY}" stroke="#94a3b8" stroke-width="2"/>`;
  }
  for(let i=0;i<=frets;i++){
    const y=top+i*gapY;
    svg += `<line x1="${left}" y1="${y}" x2="${left+(strings-1)*gapX}" y2="${y}" stroke="#94a3b8" stroke-width="${i===0?5:2}"/>`;
  }
  shape.forEach((fret,i)=>{
    const x=left+i*gapX;
    if(fret==="x") svg += `<text x="${x}" y="26" fill="#fca5a5" text-anchor="middle" font-size="18">\u00D7</text>`;
    else if(fret===0) svg += `<circle cx="${x}" cy="20" r="7" fill="none" stroke="#c4b5fd" stroke-width="2"/>`;
    else svg += `<circle cx="${x}" cy="${top+(fret-.5)*gapY}" r="10" fill="#8b5cf6"/>`;
  });
  return svg + `</svg>`;
}
