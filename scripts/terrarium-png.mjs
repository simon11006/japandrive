import { inflateSync } from 'node:zlib';
// Terrain Tiles publishes non-interlaced, 8-bit RGB/RGBA PNGs. Keep the
// offline importer dependency-free; unexpected formats fail explicitly.
export function decodeTerrariumPng(buffer) {
  if (buffer.toString('hex',0,8)!=='89504e470d0a1a0a') throw Error('Not a PNG');
  let width,height,channels; const chunks=[];
  for(let i=8;i<buffer.length;){const len=buffer.readUInt32BE(i),type=buffer.toString('ascii',i+4,i+8),data=buffer.subarray(i+8,i+8+len);i+=len+12;
    if(type==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);channels=data[9]===2?3:data[9]===6?4:0;if(data[8]!==8||!channels||data[12])throw Error('Unsupported terrain PNG');}
    if(type==='IDAT')chunks.push(data);
  }
  const raw=inflateSync(Buffer.concat(chunks)),stride=width*channels,pixels=Buffer.alloc(height*stride);
  const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  for(let y=0;y<height;y++){const filter=raw[y*(stride+1)];if(filter>4)throw Error('PNG filter');for(let x=0;x<stride;x++){const at=y*stride+x,a=x>=channels?pixels[at-channels]:0,b=y?pixels[at-stride]:0,c=y&&x>=channels?pixels[at-stride-channels]:0;pixels[at]=(raw[y*(stride+1)+1+x]+[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter])&255;}}
  return {width,height,at:(x,y)=>{const i=(y*width+x)*channels;return pixels[i]*256+pixels[i+1]+pixels[i+2]/256-32768;}};
}
