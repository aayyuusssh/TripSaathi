const fs=require('node:fs');const path=require('node:path');const root=path.resolve(__dirname,'..');
for(const app of ['api','web','worker'])for(const name of ['domain','database']){
  const destination=path.join(root,'apps',app,'node_modules','@tripsaathi',name);
  if(!fs.existsSync(destination)||fs.lstatSync(destination).isSymbolicLink())continue;
  const source=path.join(root,'packages',name);const dist=path.join(source,'dist');
  if(fs.existsSync(dist))fs.cpSync(dist,path.join(destination,'dist'),{recursive:true});
  fs.copyFileSync(path.join(source,'package.json'),path.join(destination,'package.json'));
}
