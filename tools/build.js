// Builds the small distributable copy of the game into dist/.
//   setup once:  npm install            (installs html-minifier-terser)
//   build:       npm run build
// Edit the readable sources in the repo root (wa-no-shodana.html etc.), never the files in dist/.
// The build only strips comments/whitespace and shortens local names; behaviour is unchanged.
const {minify}=require('html-minifier-terser'), fs=require('fs'), path=require('path');
const root=path.join(__dirname,'..'), out=path.join(root,'dist');
const FILES=['wa-no-shodana.html','wa-no-chikashitsu.html'];   // pages link to each other by these names, so keep them together
(async()=>{
  fs.mkdirSync(out,{recursive:true});
  for(const f of FILES){
    const src=fs.readFileSync(path.join(root,f),'utf8');
    const min=await minify(src,{collapseWhitespace:true,removeComments:true,minifyCSS:true,
      minifyJS:{compress:{passes:2},mangle:true,format:{comments:false}}});
    fs.writeFileSync(path.join(out,f),min);
    console.log(f.padEnd(26),(Buffer.byteLength(src)/1024).toFixed(1)+'KB ->',(Buffer.byteLength(min)/1024).toFixed(1)+'KB');
  }
})();
