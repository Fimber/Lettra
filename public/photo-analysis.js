/* Pixel-only text alignment. No document text or reference data is used. */
const median=a=>a.slice().sort((x,y)=>x-y)[Math.floor(a.length/2)];
function glyphMask(cv,pixels,{maxDimension=1200}={}){
 const mats=[],hold=m=>(mats.push(m),m);
 try{
  const src=hold(cv.matFromImageData(pixels)),small=hold(new cv.Mat()),gray=hold(new cv.Mat()),ink=hold(new cv.Mat());
  const scale=Math.min(1,maxDimension/Math.max(src.rows,src.cols));cv.resize(src,small,new cv.Size(Math.round(src.cols*scale),Math.round(src.rows*scale)),0,0,cv.INTER_AREA);cv.cvtColor(small,gray,cv.COLOR_RGBA2GRAY);
  cv.adaptiveThreshold(gray,ink,255,cv.ADAPTIVE_THRESH_GAUSSIAN_C,cv.THRESH_BINARY_INV,31,12);
  const labels=hold(new cv.Mat()),stats=hold(new cv.Mat()),centers=hold(new cv.Mat());const n=cv.connectedComponentsWithStats(ink,labels,stats,centers,8,cv.CV_32S);
  const glyphs=[],allowed=new Uint8Array(n);
  for(let i=1;i<n;i++){const x=stats.intAt(i,0),y=stats.intAt(i,1),w=stats.intAt(i,2),h=stats.intAt(i,3),area=stats.intAt(i,4);if(area>=4&&area<=350&&w>=2&&h>=2&&w<=40&&h<=40&&w/h<5&&h/w<5&&area/(w*h)>.12&&area/(w*h)<.92){glyphs.push({x,y,w,h,area});allowed[i]=1;}}
  const mask=new Uint8Array(gray.rows*gray.cols),points=[];
  for(let y=0;y<gray.rows;y++)for(let x=0;x<gray.cols;x++){const i=y*gray.cols+x;if(allowed[labels.data32S[i]]){mask[i]=255;if((x+y)%3===0)points.push([x-gray.cols/2,y-gray.rows/2]);}}
  return {data:mask,width:gray.cols,height:gray.rows,points,glyphs,scale,medianHeight:median(glyphs.map(x=>x.h)),medianWidth:median(glyphs.map(x=>x.w))};
 }finally{for(let i=mats.length-1;i>=0;i--)mats[i].delete();}
}
function projectionScore(points,angle,diagonal){
 const r=angle*Math.PI/180,s=Math.sin(r),c=Math.cos(r),offset=Math.ceil(diagonal),hist=new Float64Array(offset*2+3);
 for(const [x,y] of points){const value=-x*s+y*c+offset,index=Math.floor(value),part=value-index;hist[index]+=1-part;hist[index+1]+=part;}
 // Smooth subpixel quantization before looking at short-range line structure.
 let score=0,previous=0;
 for(let i=1;i<hist.length-1;i++){const current=(hist[i-1]+2*hist[i]+hist[i+1])/4;score+=(current-previous)**2;previous=current;}
 return score/Math.max(1,points.length);
}
function projectionAngle(mask){
 if(mask.glyphs.length<80||mask.points.length<200)return {angle:0,score:0,ratio:0,glyphCount:mask.glyphs.length,accepted:false,coarse:[]};
 const diagonal=Math.hypot(mask.width,mask.height),coarse=[];
 for(let a=-90;a<90;a+=2)coarse.push({angle:a,score:projectionScore(mask.points,a,diagonal)});
 coarse.sort((a,b)=>b.score-a.score);const fine=[];
 for(let a=coarse[0].angle-2;a<=coarse[0].angle+2;a+=.25)fine.push({angle:a,score:projectionScore(mask.points,a,diagonal)});
 fine.sort((a,b)=>b.score-a.score);const best=fine[0];
 const competitor=coarse.find(x=>Math.abs(x.angle-best.angle)>10&&Math.abs(x.angle-best.angle)<170);
 const ratio=best.score/(competitor?.score||1e-6);
 return {angle:best.angle,score:best.score,ratio,glyphCount:mask.glyphs.length,accepted:mask.glyphs.length>80&&ratio>1.15,coarse:coarse.slice(0,8)};
}
function expandedRotate(cv,pixels,angle,{padding=16}={}){
 if(!Number.isFinite(angle)||!Number.isFinite(padding)||padding<0)throw Error('Invalid rotation parameters');
 const src=cv.matFromImageData(pixels),r=angle*Math.PI/180;
 const width=Math.ceil(Math.abs(src.cols*Math.cos(r))+Math.abs(src.rows*Math.sin(r)))+padding*2;
 const height=Math.ceil(Math.abs(src.rows*Math.cos(r))+Math.abs(src.cols*Math.sin(r)))+padding*2;
 // OpenCV's positive angle makes a counterclockwise correction for clockwise
 // baselines in image coordinates. Translate the center into the expanded box.
 const matrix=cv.getRotationMatrix2D(new cv.Point(src.cols/2,src.rows/2),angle,1);
 matrix.data64F[2]+=(width-src.cols)/2;matrix.data64F[5]+=(height-src.rows)/2;
 const out=new cv.Mat();cv.warpAffine(src,out,matrix,new cv.Size(width,height),cv.INTER_CUBIC,cv.BORDER_CONSTANT,new cv.Scalar(255,255,255,255));
 const result={data:new Uint8ClampedArray(out.data),width,height};src.delete();matrix.delete();out.delete();return result;
}
function textRegions(cv, pixels) {
 const mats=[],hold=m=>(mats.push(m),m);
 try {
  const src=hold(cv.matFromImageData(pixels)),gray=hold(new cv.Mat()),bin=hold(new cv.Mat()),labels=hold(new cv.Mat()),stats=hold(new cv.Mat()),centers=hold(new cv.Mat());
  cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);cv.threshold(gray,bin,0,255,cv.THRESH_BINARY_INV+cv.THRESH_OTSU);
  let n=cv.connectedComponentsWithStats(bin,labels,stats,centers,8,cv.CV_32S);
  const kept=new Uint8Array(n),heights=[];
  for(let i=1;i<n;i++){const w=stats.intAt(i,2),h=stats.intAt(i,3),area=stats.intAt(i,4);if(h>=6&&h<=65&&w>=2&&w<=h*3&&area>=8&&area/(w*h)<.92){kept[i]=1;heights.push(h);}}
  if(heights.length<80)return [];
  const size=median(heights),mask=hold(cv.Mat.zeros(gray.rows,gray.cols,cv.CV_8UC1));
  for(let i=0;i<labels.data32S.length;i++)if(kept[labels.data32S[i]])mask.data[i]=255;
  const joined=hold(new cv.Mat()),kernel=hold(cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(Math.round(size*.7),Math.round(size*2.5))));
  cv.dilate(mask,joined,kernel);
  // Long vertical opening breaks thin running headings that bridge columns.
  const vertical=hold(cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(1,Math.round(size*10))));
  cv.morphologyEx(joined,joined,cv.MORPH_OPEN,vertical);
  n=cv.connectedComponentsWithStats(joined,labels,stats,centers,8,cv.CV_32S);
  const regions=[];
  for(let i=1;i<n;i++){const x=stats.intAt(i,0),y=stats.intAt(i,1),w=stats.intAt(i,2),h=stats.intAt(i,3),area=stats.intAt(i,4);if(w>size*8&&h>size*10&&area>size*size*100)regions.push({left:x,top:y,width:w,height:h});}
  // Rejoin vertically separated paragraphs in the same column. Ordering by
  // the left edge alone incorrectly puts indented lower paragraphs first.
  let changed=true;
  while(changed){changed=false;outer:for(let i=0;i<regions.length;i++)for(let j=i+1;j<regions.length;j++){
   const a=regions[i],b=regions[j],overlap=Math.min(a.left+a.width,b.left+b.width)-Math.max(a.left,b.left);
   if(overlap>Math.min(a.width,b.width)*.6){const left=Math.min(a.left,b.left),top=Math.min(a.top,b.top);regions[i]={left,top,width:Math.max(a.left+a.width,b.left+b.width)-left,height:Math.max(a.top+a.height,b.top+b.height)-top};regions.splice(j,1);changed=true;break outer;}
  }}
  if(regions.length<2||regions.length>6||regions.some(r=>r.height<gray.rows*.18))return [];
  return regions.sort((a,b)=>a.left-b.left).map(r=>{const left=Math.max(0,r.left-8),top=Math.max(0,r.top-8);return {left,top,width:Math.min(gray.cols,r.left+r.width+8)-left,height:Math.min(gray.rows,r.top+r.height+8)-top};});
 }finally{for(let i=mats.length-1;i>=0;i--)mats[i].delete();}
}
self.lettraPhoto={glyphMask,projectionAngle,projectionScore,expandedRotate,textRegions};
