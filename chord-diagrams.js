const SHARP_NOTES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const FLAT_NOTES = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];

const NOTE_INDEX = {
  C:0,"B#":0,"C#":1,Db:1,D:2,"D#":3,Eb:3,E:4,Fb:4,
  "E#":5,F:5,"F#":6,Gb:6,G:7,"G#":8,Ab:8,A:9,"A#":10,Bb:10,B:11,Cb:11
};

const FORMULAS = {
  "": { label:"Maior", intervals:[0,4,7], formula:"1 · 3 · 5" },
  "m": { label:"Menor", intervals:[0,3,7], formula:"1 · ♭3 · 5" },
  "5": { label:"Power chord", intervals:[0,7], formula:"1 · 5" },
  "dim": { label:"Diminuto", intervals:[0,3,6], formula:"1 · ♭3 · ♭5" },
  "dim7": { label:"Diminuto 7", intervals:[0,3,6,9], formula:"1 · ♭3 · ♭5 · 𝄫7" },
  "aug": { label:"Aumentado", intervals:[0,4,8], formula:"1 · 3 · ♯5" },
  "sus2": { label:"Suspenso 2", intervals:[0,2,7], formula:"1 · 2 · 5" },
  "sus4": { label:"Suspenso 4", intervals:[0,5,7], formula:"1 · 4 · 5" },
  "7sus4": { label:"7 suspenso 4", intervals:[0,5,7,10], formula:"1 · 4 · 5 · ♭7" },
  "6": { label:"Maior 6", intervals:[0,4,7,9], formula:"1 · 3 · 5 · 6" },
  "m6": { label:"Menor 6", intervals:[0,3,7,9], formula:"1 · ♭3 · 5 · 6" },
  "6/9": { label:"6/9", intervals:[0,2,4,7,9], formula:"1 · 2 · 3 · 5 · 6" },
  "add9": { label:"Add 9", intervals:[0,2,4,7], formula:"1 · 2 · 3 · 5" },
  "add11": { label:"Add 11", intervals:[0,4,5,7], formula:"1 · 3 · 4 · 5" },
  "madd9": { label:"Menor add 9", intervals:[0,2,3,7], formula:"1 · 2 · ♭3 · 5" },
  "7": { label:"Dominante 7", intervals:[0,4,7,10], formula:"1 · 3 · 5 · ♭7" },
  "maj7": { label:"Maior 7", intervals:[0,4,7,11], formula:"1 · 3 · 5 · 7" },
  "m7": { label:"Menor 7", intervals:[0,3,7,10], formula:"1 · ♭3 · 5 · ♭7" },
  "mMaj7": { label:"Menor maior 7", intervals:[0,3,7,11], formula:"1 · ♭3 · 5 · 7" },
  "m7b5": { label:"Meio-diminuto", intervals:[0,3,6,10], formula:"1 · ♭3 · ♭5 · ♭7" },
  "9": { label:"Dominante 9", intervals:[0,2,4,7,10], formula:"1 · 3 · 5 · ♭7 · 9" },
  "maj9": { label:"Maior 9", intervals:[0,2,4,7,11], formula:"1 · 3 · 5 · 7 · 9" },
  "m9": { label:"Menor 9", intervals:[0,2,3,7,10], formula:"1 · ♭3 · 5 · ♭7 · 9" },
  "11": { label:"Dominante 11", intervals:[0,2,4,5,7,10], formula:"1 · 3 · 5 · ♭7 · 9 · 11" },
  "maj11": { label:"Maior 11", intervals:[0,2,4,5,7,11], formula:"1 · 3 · 5 · 7 · 9 · 11" },
  "m11": { label:"Menor 11", intervals:[0,2,3,5,7,10], formula:"1 · ♭3 · 5 · ♭7 · 9 · 11" },
  "13": { label:"Dominante 13", intervals:[0,2,4,7,9,10], formula:"1 · 3 · 5 · ♭7 · 9 · 13" },
  "maj13": { label:"Maior 13", intervals:[0,2,4,7,9,11], formula:"1 · 3 · 5 · 7 · 9 · 13" },
  "m13": { label:"Menor 13", intervals:[0,2,3,7,9,10], formula:"1 · ♭3 · 5 · ♭7 · 9 · 13" },
  "7b9": { label:"7 ♭9", intervals:[0,1,4,7,10], formula:"1 · 3 · 5 · ♭7 · ♭9" },
  "7#9": { label:"7 ♯9", intervals:[0,3,4,7,10], formula:"1 · 3 · 5 · ♭7 · ♯9" },
  "7b5": { label:"7 ♭5", intervals:[0,4,6,10], formula:"1 · 3 · ♭5 · ♭7" },
  "7#5": { label:"7 ♯5", intervals:[0,4,8,10], formula:"1 · 3 · ♯5 · ♭7" },
  "maj7#11": { label:"Maior 7 ♯11", intervals:[0,4,6,7,11], formula:"1 · 3 · 5 · 7 · ♯11" },
  "7#11": { label:"7 ♯11", intervals:[0,4,6,7,10], formula:"1 · 3 · 5 · ♭7 · ♯11" },
  "7b13": { label:"7 ♭13", intervals:[0,4,7,8,10], formula:"1 · 3 · 5 · ♭7 · ♭13" },
  "alt": { label:"Alterado", intervals:[0,1,3,4,6,8,10], formula:"1 · 3 · ♭7 + alterações" }
};

const TUNINGS = {
  guitar: { name:"Violão / guitarra", notes:[4,9,2,7,11,4], strings:6 },
  ukulele: { name:"Ukulele", notes:[7,0,4,9], strings:4 }
};

const CURATED = {
  C:["x",3,2,0,1,0],D:["x","x",0,2,3,2],E:[0,2,2,1,0,0],
  F:[1,3,3,2,1,1],G:[3,2,0,0,0,3],A:["x",0,2,2,2,0],B:["x",2,4,4,4,2],
  Am:["x",0,2,2,1,0],Bm:["x",2,4,4,3,2],Cm:["x",3,5,5,4,3],
  Dm:["x","x",0,2,3,1],Em:[0,2,2,0,0,0],Fm:[1,3,3,1,1,1],Gm:[3,5,5,3,3,3],
  C7:["x",3,2,3,1,0],D7:["x","x",0,2,1,2],E7:[0,2,0,1,0,0],
  G7:[3,2,0,0,0,1],A7:["x",0,2,0,2,0],B7:["x",2,1,2,0,2],
  Cmaj7:["x",3,2,0,0,0],Dmaj7:["x","x",0,2,2,2],Emaj7:[0,2,1,1,0,0],
  Fmaj7:["x","x",3,2,1,0],Gmaj7:[3,2,0,0,0,2],Amaj7:["x",0,2,1,2,0],
  Am7:["x",0,2,0,1,0],Bm7:["x",2,4,2,3,2],Dm7:["x","x",0,2,1,1],Em7:[0,2,0,0,0,0]
};

function escapeHtml(value=""){
  return String(value)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function normalizeSuffix(raw=""){
  let value=String(raw)
    .replace(/\s+/g,"")
    .replace(/[()]/g,"")
    .replace(/°|º/g,"dim")
    .replace(/ø7?/g,"m7b5")
    .replace(/^\+$/,"aug")
    .replace(/^M7$/,"maj7")
    .replace(/^7M$/,"maj7")
    .replace(/^m7M$/,"mMaj7")
    .replace(/^mM7$/,"mMaj7")
    .replace(/^m7b5$/i,"m7b5")
    .replace(/^7\/9$/,"9")
    .replace(/^7\/11$/,"11")
    .replace(/^7\/13$/,"13")
    .replace(/^79$/,"9")
    .replace(/^711$/,"11")
    .replace(/^713$/,"13")
    .replace(/^add2$/,"add9")
    .replace(/^add4$/,"add11")
    .replace(/^madd2$/,"madd9")
    .replace(/^7\(b9\)$/,"7b9")
    .replace(/^7\(#9\)$/,"7#9")
    .replace(/^7\(b5\)$/,"7b5")
    .replace(/^7\(#5\)$/,"7#5");

  if (/^maj7?$/i.test(value)) return "maj7";
  if (/^maj9$/i.test(value)) return "maj9";
  if (/^maj11$/i.test(value)) return "maj11";
  if (/^maj13$/i.test(value)) return "maj13";
  if (/^min$/i.test(value)) return "m";
  if (/^min7$/i.test(value)) return "m7";
  if (/^min9$/i.test(value)) return "m9";
  if (/^min11$/i.test(value)) return "m11";
  if (/^min13$/i.test(value)) return "m13";
  if (/^aug$/i.test(value)) return "aug";

  return value;
}

export function parseChord(chord=""){
  const source=String(chord).trim().replace(/♯/g,"#").replace(/♭/g,"b");
  const match=source.match(/^([A-G](?:#|b)?)(.*?)(?:\/([A-G](?:#|b)?))?$/);
  if(!match) return null;

  const root=match[1];
  const bass=match[3]||"";
  const suffix=normalizeSuffix(match[2]||"");
  const formula=FORMULAS[suffix]||FORMULAS[""];

  return { source,root,bass,suffix,formula };
}

export function getChordInfo(chord=""){
  const parsed=parseChord(chord);
  if(!parsed) return null;

  const rootIndex=NOTE_INDEX[parsed.root];
  const preferFlats=/b/.test(parsed.root)||/b/.test(parsed.bass);
  const noteNames=preferFlats?FLAT_NOTES:SHARP_NOTES;
  const notes=[...new Set(parsed.formula.intervals.map(interval=>noteNames[(rootIndex+interval)%12]))];

  return {
    ...parsed,
    notes,
    label:parsed.formula.label,
    formulaText:parsed.formula.formula
  };
}

function noteClassesForChord(chord){
  const info=getChordInfo(chord);
  if(!info) return null;
  const rootIndex=NOTE_INDEX[info.root];
  return {
    ...info,
    rootIndex,
    bassIndex:info.bass?NOTE_INDEX[info.bass]:rootIndex,
    tones:new Set(info.formula.intervals.map(interval=>(rootIndex+interval)%12))
  };
}

function generatedVoicings(chord,instrument="guitar",limit=6){
  const tuning=TUNINGS[instrument]||TUNINGS.guitar;
  const info=noteClassesForChord(chord);
  if(!info) return [];

  const candidates=[];
  const maxFret=12;

  for(let windowStart=0;windowStart<=8;windowStart+=1){
    const windowEnd=Math.min(maxFret,windowStart+4);
    const shape=tuning.notes.map((openNote)=>{
      const frets=[];
      for(let fret=0;fret<=maxFret;fret+=1){
        if(fret>0 && (fret<Math.max(1,windowStart)||fret>windowEnd)) continue;
        if(fret===0 && windowStart>1) continue;
        if(info.tones.has((openNote+fret)%12)) frets.push(fret);
      }
      return frets[0]??"x";
    });

    const targetBass=info.bassIndex;
    let bassFound=false;
    for(let string=0;string<shape.length;string+=1){
      const fret=shape[string];
      if(fret==="x") continue;
      const note=(tuning.notes[string]+fret)%12;
      if(!bassFound && note===targetBass){
        bassFound=true;
        continue;
      }
      if(!bassFound) shape[string]="x";
    }

    const sounding=shape.filter(value=>value!=="x");
    if(sounding.length<3) continue;

    const notesPlayed=new Set();
    shape.forEach((fret,string)=>{
      if(fret==="x") return;
      notesPlayed.add((tuning.notes[string]+fret)%12);
    });

    if(!notesPlayed.has(info.rootIndex)) continue;

    const positive=sounding.filter(value=>typeof value==="number"&&value>0);
    const span=positive.length?Math.max(...positive)-Math.min(...positive):0;
    if(span>4) continue;

    const signature=shape.join(",");
    if(candidates.some(item=>item.signature===signature)) continue;

    const coverage=[...info.tones].filter(note=>notesPlayed.has(note)).length;
    const openCount=shape.filter(value=>value===0).length;
    const muted=shape.filter(value=>value==="x").length;
    const score=coverage*20+openCount*2-muted-span*2-windowStart*.25;

    candidates.push({shape,signature,score,startFret:windowStart});
  }

  candidates.sort((a,b)=>b.score-a.score);

  if(instrument==="guitar"){
    const clean=parseChord(chord);
    const baseName=clean?clean.root+clean.suffix:"";
    const curated=CURATED[baseName];
    if(curated){
      const signature=curated.join(",");
      candidates.unshift({shape:curated,signature,score:999,startFret:0});
    }
  }

  return candidates
    .filter((item,index,array)=>array.findIndex(other=>other.signature===item.signature)===index)
    .slice(0,limit)
    .map(item=>item.shape);
}

export function getChordVariations(chord,instrument="guitar",limit=6){
  if(instrument==="keyboard") return [getChordInfo(chord)].filter(Boolean);
  return generatedVoicings(chord,instrument,limit);
}

export function getChordShape(chord){
  return getChordVariations(chord,"guitar",1)[0]||null;
}

function drawFretboard(chord,instrument="guitar",variation=0){
  const tuning=TUNINGS[instrument]||TUNINGS.guitar;
  const variations=getChordVariations(chord,instrument,6);
  const shape=variations[Math.max(0,Math.min(variation,variations.length-1))];

  if(!shape){
    return `<div class="empty">Não foi possível gerar uma posição prática para <strong>${escapeHtml(chord)}</strong>.</div>`;
  }

  const strings=tuning.strings;
  const width=instrument==="ukulele"?230:290;
  const height=230;
  const left=38;
  const top=54;
  const gapX=(width-left*2)/(strings-1);
  const gapY=30;
  const positive=shape.filter(value=>typeof value==="number"&&value>0);
  const minFret=positive.length?Math.min(...positive):1;
  const baseFret=minFret<=1?1:minFret;
  const rows=5;

  let svg=`<svg class="instrument-diagram-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${tuning.name}: ${escapeHtml(chord)}">`;

  if(baseFret>1){
    svg+=`<text x="6" y="${top+17}" fill="currentColor" font-size="13">${baseFret}fr</text>`;
  }

  for(let index=0;index<strings;index+=1){
    const x=left+index*gapX;
    svg+=`<line x1="${x}" y1="${top}" x2="${x}" y2="${top+rows*gapY}" stroke="currentColor" stroke-opacity=".55" stroke-width="2"/>`;
  }

  for(let fret=0;fret<=rows;fret+=1){
    const y=top+fret*gapY;
    svg+=`<line x1="${left}" y1="${y}" x2="${left+(strings-1)*gapX}" y2="${y}" stroke="currentColor" stroke-opacity=".55" stroke-width="${fret===0&&baseFret===1?5:2}"/>`;
  }

  shape.forEach((fret,index)=>{
    const x=left+index*gapX;
    if(fret==="x"){
      svg+=`<text x="${x}" y="28" fill="#ff7c86" text-anchor="middle" font-size="17">×</text>`;
      return;
    }
    if(fret===0){
      svg+=`<circle cx="${x}" cy="22" r="7" fill="none" stroke="#ff9a5c" stroke-width="2"/>`;
      return;
    }

    const visualFret=fret-baseFret+1;
    if(visualFret<1||visualFret>rows) return;
    const y=top+(visualFret-.5)*gapY;
    svg+=`<circle cx="${x}" cy="${y}" r="10" fill="#ff6a00"/>`;
  });

  svg+="</svg>";
  return svg;
}

function drawKeyboard(chord){
  const info=noteClassesForChord(chord);
  if(!info) return `<div class="empty">Acorde não reconhecido.</div>`;

  const whitePattern=[0,2,4,5,7,9,11];
  const blackAfter={0:1,2:3,5:6,7:8,9:10};
  const whites=14;
  const width=560;
  const height=210;
  const whiteWidth=width/whites;
  const whiteHeight=170;
  const blackWidth=whiteWidth*.62;
  const blackHeight=105;
  let svg=`<svg class="keyboard-diagram-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Teclado: ${escapeHtml(chord)}">`;

  for(let i=0;i<whites;i+=1){
    const octave=Math.floor(i/7);
    const step=whitePattern[i%7];
    const noteClass=step;
    const active=info.tones.has(noteClass);
    const x=i*whiteWidth;
    svg+=`<rect x="${x+1}" y="8" width="${whiteWidth-2}" height="${whiteHeight}" rx="3" fill="${active?"#ff6a00":"#f4f4f5"}" stroke="#3b3e45" stroke-width="1"/>`;
    if(active){
      const names=/b/.test(info.root)?FLAT_NOTES:SHARP_NOTES;
      svg+=`<text x="${x+whiteWidth/2}" y="164" text-anchor="middle" fill="#111" font-size="11" font-weight="800">${names[noteClass]}</text>`;
    }
  }

  for(let i=0;i<whites-1;i+=1){
    const whiteClass=whitePattern[i%7];
    const blackClass=blackAfter[whiteClass];
    if(blackClass===undefined) continue;
    const active=info.tones.has(blackClass);
    const x=(i+1)*whiteWidth-blackWidth/2;
    svg+=`<rect x="${x}" y="8" width="${blackWidth}" height="${blackHeight}" rx="3" fill="${active?"#ff6a00":"#15171b"}" stroke="#050607" stroke-width="1"/>`;
  }

  svg+="</svg>";
  return svg;
}

export function drawInstrumentChord(chord,instrument="guitar",variation=0){
  if(instrument==="keyboard") return drawKeyboard(chord);
  return drawFretboard(chord,instrument,variation);
}

export function drawChordDiagram(chord){
  return drawInstrumentChord(chord,"guitar",0);
}

export const CHORD_QUALITY_CATALOG = Object.entries(FORMULAS).map(([suffix,data])=>({
  suffix,label:data.label,formula:data.formula
}));
