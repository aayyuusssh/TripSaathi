import {Injectable,Inject,BadRequestException,NotFoundException,ConflictException,ServiceUnavailableException} from '@nestjs/common';
import {prisma,Prisma,encryptDocument,decryptDocument} from '@tripsaathi/database';
import {sniffDocument,createTripSchema} from '@tripsaathi/domain';
import {randomUUID,createHash} from 'node:crypto';import {z} from 'zod';
import {TripsService,serial,parsed,getTrip} from './trips.service';
const versionSchema=z.object({expectedVersion:z.number().int().positive()});
const confirmSchema=versionSchema.extend({reviewed:z.literal(true),trip:createTripSchema,removeOriginal:z.boolean().default(true),targetTripId:z.string().optional(),expectedTripRevision:z.number().int().positive().optional()}).refine(v=>!v.targetTripId||!!v.expectedTripRevision,'Existing trip import needs its reviewed revision');
const extractSchema=versionSchema.extend({consentToGemini:z.literal(true)});
const publicImport=(doc:{ciphertext:unknown;[key:string]:unknown})=>{const {ciphertext,confirmationDigest,...metadata}=doc;return{...metadata,hasOriginal:!!ciphertext};};
export async function lockOwner(tx:Prisma.TransactionClient,ownerId:string){await tx.notificationPreference.upsert({where:{ownerId},create:{ownerId},update:{}});await tx.$queryRaw`SELECT "ownerId" FROM "NotificationPreference" WHERE "ownerId"=${ownerId} FOR UPDATE`;}
export async function ownedImport(tx:Prisma.TransactionClient|typeof prisma,id:string,ownerId:string){const doc=await tx.documentImport.findFirst({where:{id,ownerId}});if(!doc)throw new NotFoundException('Import not found');return doc;}
@Injectable()
export class ImportsService{
 constructor(@Inject(TripsService)private readonly trips:TripsService){}
 async list(ownerId:string){const docs=await prisma.documentImport.findMany({where:{ownerId,status:{notIn:['DELETED','EXPIRED']}},orderBy:{createdAt:'desc'},take:30});return docs.map(publicImport);}
 async get(id:string,ownerId:string){return publicImport(await ownedImport(prisma,id,ownerId));}
 async upload(ownerId:string,file:{buffer:Buffer;originalname:string;mimetype:string}){
  if(!file?.buffer)throw new BadRequestException('Choose one document');let mimeType:string;try{mimeType=sniffDocument(file.buffer,file.mimetype);}catch(error){throw new BadRequestException((error as Error).message);}
  const id=randomUUID(),fileName=file.originalname.replace(/[\r\n\x00-\x1f\\/]/g,'_').slice(0,150)||'booking-document';const ciphertext=encryptDocument(file.buffer,ownerId,id);
  return serial(async tx=>{await lockOwner(tx,ownerId);const quota=await tx.documentImport.aggregate({where:{ownerId,ciphertext:{not:null}},_sum:{byteLength:true},_count:true});if(quota._count>=20||(quota._sum.byteLength??0)+file.buffer.length>40*1024*1024)throw new ConflictException('Private upload quota reached. Remove older originals first.');
   const hours=Math.max(1,Math.min(168,Number(process.env.IMPORT_RETENTION_HOURS)||24));const doc=await tx.documentImport.create({data:{id,ownerId,fileName,mimeType,byteLength:file.buffer.length,ciphertext:new Uint8Array(ciphertext),expiresAt:new Date(Date.now()+hours*3600000)}});return publicImport(doc);
  });
 }
 async download(id:string,ownerId:string){const doc=await ownedImport(prisma,id,ownerId);if(!doc.ciphertext||doc.purgedAt||doc.expiresAt.getTime()<=Date.now())throw new NotFoundException('Original document is no longer retained');return{bytes:decryptDocument(doc.ciphertext,ownerId,id),fileName:doc.fileName};}
 async extract(id:string,ownerId:string,body:unknown){const input=parsed(extractSchema,body);if(!process.env.GEMINI_API_KEY)throw new ServiceUnavailableException('Gemini key is required for document extraction');return serial(async tx=>{await lockOwner(tx,ownerId);await tx.$queryRaw`SELECT "id" FROM "DocumentImport" WHERE "id"=${id} AND "ownerId"=${ownerId} FOR UPDATE`;const doc=await ownedImport(tx,id,ownerId);
  if(['QUEUED','STARTING','READY'].includes(doc.status))return publicImport(doc);if(doc.version!==input.expectedVersion)throw new ConflictException('Import changed; refresh before extraction');if(doc.status!=='STORED'||!doc.ciphertext||doc.expiresAt.getTime()<=Date.now())throw new ConflictException('This original cannot be extracted. Failed/uncertain requests are not automatically retried.');
  const used=await tx.documentImport.aggregate({where:{ownerId,consentedAt:{gte:new Date(Date.now()-86400000)}},_sum:{extractionAttempts:true}});const cap=Math.max(1,Math.min(10,Number(process.env.IMPORT_DAILY_EXTRACTION_LIMIT)||3));if((used._sum.extractionAttempts??0)>=cap)throw new ConflictException('Document extraction request cap reached for the rolling 24-hour window');
  const updated=await tx.documentImport.update({where:{id},data:{status:'QUEUED',consentedAt:new Date(),extractionAttempts:{increment:1},version:{increment:1}}});await tx.outbox.create({data:{type:'DOCUMENT_EXTRACT',payload:{importId:id}}});return publicImport(updated);
 });}
 async confirm(id:string,ownerId:string,body:unknown){const input=parsed(confirmSchema,body);const digest=createHash('sha256').update(JSON.stringify({trip:input.trip,targetTripId:input.targetTripId??null})).digest('hex');return serial(async tx=>{await lockOwner(tx,ownerId);if(input.targetTripId)await tx.$queryRaw`SELECT "id" FROM "Trip" WHERE "id"=${input.targetTripId} AND "ownerId"=${ownerId} FOR UPDATE`;await tx.$queryRaw`SELECT "id" FROM "DocumentImport" WHERE "id"=${id} AND "ownerId"=${ownerId} FOR UPDATE`;const doc=await ownedImport(tx,id,ownerId);
  if(doc.confirmedTripId){if(doc.confirmationDigest!==digest)throw new ConflictException('This import was already confirmed with different trip details');return{tripId:doc.confirmedTripId,alreadyConfirmed:true};}
  if(doc.version!==input.expectedVersion||doc.status!=='READY'||doc.expiresAt.getTime()<=Date.now())throw new ConflictException('Import is not available for current review');
  if(input.targetTripId&&(await getTrip(input.targetTripId,ownerId,tx)).revision!==input.expectedTripRevision)throw new ConflictException('Target trip changed; refresh and review again');const trip=input.targetTripId?await this.trips.appendWithin(tx,input.targetTripId,ownerId,input.trip):await this.trips.createWithin(tx,input.trip,ownerId);await tx.documentImport.update({where:{id},data:{status:'CONFIRMED',confirmedTripId:trip.id,confirmationDigest:digest,version:{increment:1},...(input.removeOriginal?{ciphertext:null,draft:Prisma.DbNull,purgedAt:new Date(),fileName:'(original removed)'}:{})}});return{tripId:trip.id};
 });}
 async remove(id:string,ownerId:string,body:unknown){const input=parsed(versionSchema,body);return serial(async tx=>{await lockOwner(tx,ownerId);const doc=await ownedImport(tx,id,ownerId);if(['DELETED','EXPIRED'].includes(doc.status))return{removed:true};if(doc.version!==input.expectedVersion)throw new ConflictException('Import changed; refresh before removing');await tx.documentImport.update({where:{id},data:{status:'DELETED',ciphertext:null,draft:Prisma.DbNull,error:null,fileName:'(removed)',purgedAt:new Date(),version:{increment:1}}});return{removed:true};});}
}

