import {prisma,Prisma,decryptDocument} from '@tripsaathi/database';import {extractionSchema} from '@tripsaathi/domain';import {GeminiDocumentExtractor,type DocumentExtractor} from './integrations/document-extractor';import {createNotification} from './notifications';
const json=(value:unknown)=>JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export async function extractImport(importId:string,extractor:DocumentExtractor=new GeminiDocumentExtractor(process.env.GEMINI_API_KEY??'')){
 const doc=await prisma.documentImport.findUnique({where:{id:importId}});if(!doc||doc.status!=='QUEUED'||!doc.consentedAt||!doc.ciphertext||doc.expiresAt.getTime()<=Date.now())return;
 const claimed=await prisma.documentImport.updateMany({where:{id:doc.id,status:'QUEUED',version:doc.version},data:{status:'STARTING'}});if(!claimed.count)return;
 try{
  const result=extractionSchema.parse(await extractor.extract(decryptDocument(doc.ciphertext,doc.ownerId,doc.id),doc.mimeType));
  await prisma.$transaction(async tx=>{await tx.$queryRaw`SELECT "id" FROM "DocumentImport" WHERE "id"=${doc.id} FOR UPDATE`;const current=await tx.documentImport.findUnique({where:{id:doc.id}});if(!current||current.status!=='STARTING'||current.version!==doc.version||current.expiresAt.getTime()<=Date.now()||current.purgedAt)return;
   await tx.documentImport.update({where:{id:doc.id},data:{status:'READY',draft:json(result),error:null,version:{increment:1}}});await createNotification(tx,doc.ownerId,{sourceKey:`import-ready:${doc.id}`,kind:'IMPORT_READY',title:'Document ready for review',message:'Extracted booking fields require your review before a trip is created. Unknown fields remain unverified.'});
  });
 }catch(error){const providerCode=/HTTP (\d{3})/.exec(error instanceof Error?error.message:'')?.[1];const message=providerCode?`Gemini extraction HTTP ${providerCode}. No automatic retry.`:'Extraction failed or returned invalid fields. No automatic retry; original remains available until retention expires.';await prisma.documentImport.updateMany({where:{id:doc.id,status:'STARTING',version:doc.version},data:{status:'FAILED',error:message,version:{increment:1}}});}
}
export async function importMaintenance(){
 await prisma.documentImport.updateMany({where:{status:'STARTING',updatedAt:{lt:new Date(Date.now()-120000)}},data:{status:'UNKNOWN_OUTCOME',error:'Worker interrupted during document extraction; no automatic retry.',version:{increment:1}}});
 const expired=await prisma.documentImport.findMany({where:{expiresAt:{lte:new Date()},purgedAt:null},select:{id:true},take:50});for(const doc of expired)await prisma.$transaction(async tx=>{await tx.$queryRaw`SELECT "id" FROM "DocumentImport" WHERE "id"=${doc.id} FOR UPDATE`;const current=await tx.documentImport.findUnique({where:{id:doc.id}});if(!current||current.purgedAt||current.expiresAt.getTime()>Date.now())return;await tx.documentImport.update({where:{id:doc.id},data:{ciphertext:null,draft:Prisma.DbNull,error:null,fileName:'(expired)',status:current.confirmedTripId?'CONFIRMED':'EXPIRED',purgedAt:new Date(),version:{increment:1}}});});
}
