import {HotelSearchService} from './hotel-search.service';
import 'reflect-metadata';
import {config} from 'dotenv';
import {resolve} from 'node:path';
config({path:resolve(process.cwd(),'../../.env')});
import {NestFactory} from '@nestjs/core';
import {Module,Controller,Get,Post,Patch,Param,Body,Req,Inject,Sse,Query,UnauthorizedException,UseInterceptors,UploadedFile,Res} from '@nestjs/common';
import {FileInterceptor} from '@nestjs/platform-express';
import type {Response} from 'express';
import {randomUUID} from 'node:crypto';
import {interval,concatMap,startWith} from 'rxjs';
import {timingSafeEqual} from 'node:crypto';
import {SwaggerModule,DocumentBuilder} from '@nestjs/swagger';
import {prisma} from '@tripsaathi/database';
import {createTripSchema,demoTrip,providerCapabilities} from '@tripsaathi/domain';
import {z} from 'zod';
import {TripsService,parsed} from './trips.service';
import {IdentityGuard,identityConfig,owner,type PrincipalRequest} from './identity';
import {MonitoringService} from './monitoring.service';
import {WorkflowService} from './workflow.service';
import {ImportsService} from './imports.service';
import {NotificationsService} from './notifications.service';
import {RuntimeService} from './runtime.service';
import {ReleaseService} from './release.service';
import {ResearchRecoveryService} from './research-recovery.service';
import {FlightSearchService} from './flight-search.service';
@Controller('v1')
class TripsController{
  constructor(@Inject(TripsService)private readonly trips:TripsService,@Inject(MonitoringService)private readonly monitoring:MonitoringService,@Inject(WorkflowService)private readonly workflow:WorkflowService,@Inject(ImportsService)private readonly imports:ImportsService,@Inject(NotificationsService)private readonly notifications:NotificationsService,@Inject(RuntimeService)private readonly runtime:RuntimeService,@Inject(ReleaseService)private readonly release:ReleaseService,@Inject(ResearchRecoveryService)private readonly researchRecovery:ResearchRecoveryService,@Inject(FlightSearchService)private readonly flightSearch:FlightSearchService,@Inject(HotelSearchService)private readonly hotelSearch:HotelSearchService){}
  @Get('imports')listImports(@Req()req:PrincipalRequest){return this.imports.list(owner(req));}
  @Get('imports/:id')getImport(@Req()req:PrincipalRequest,@Param('id')id:string){return this.imports.get(id,owner(req));}
  @Post('imports')@UseInterceptors(FileInterceptor('document',{limits:{fileSize:5*1024*1024,files:1,fields:0,parts:2}}))upload(@Req()req:PrincipalRequest,@UploadedFile()file:Express.Multer.File){return this.imports.upload(owner(req),file);}
  @Get('imports/:id/original')async original(@Req()req:PrincipalRequest,@Param('id')id:string,@Res()res:Response){const result=await this.imports.download(id,owner(req));res.setHeader('Content-Type','application/octet-stream');res.setHeader('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(result.fileName)}`);res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.send(result.bytes);}
  @Post('imports/:id/extract')extract(@Req()req:PrincipalRequest,@Param('id')id:string,@Body()body:unknown){return this.imports.extract(id,owner(req),body);}
  @Post('imports/:id/confirm')confirmImport(@Req()req:PrincipalRequest,@Param('id')id:string,@Body()body:unknown){return this.imports.confirm(id,owner(req),body);}
  @Post('imports/:id/remove')removeImport(@Req()req:PrincipalRequest,@Param('id')id:string,@Body()body:unknown){return this.imports.remove(id,owner(req),body);}
  @Get('notifications')inbox(@Req()req:PrincipalRequest){return this.notifications.inbox(owner(req));}
  @Post('notifications/preferences')notificationPrefs(@Req()req:PrincipalRequest,@Body()body:unknown){return this.notifications.preferences(owner(req),body);}
  @Post('notifications/read-all')readAll(@Req()req:PrincipalRequest){return this.notifications.readAll(owner(req));}
  @Post('notifications/:id/read')readNotification(@Req()req:PrincipalRequest,@Param('id')id:string){return this.notifications.read(owner(req),id);}
  @Get('research/:id/reconciliation')researchRecoveryState(@Req()req:PrincipalRequest,@Param('id')id:string){return this.researchRecovery.state(id,owner(req));}
  @Post('research/:id/reconciliation')requestResearchRecovery(@Req()req:PrincipalRequest,@Param('id')id:string,@Body()body:unknown){return this.researchRecovery.request(id,owner(req),body);}
  @Post('trips/:id/hotel-shortlist')shortlistHotel(@Req()req:PrincipalRequest,@Param('id')id:string,@Body()body:unknown){return this.hotelSearch.shortlist(id,owner(req),body);}
  @Get('trips/:id/hotel-search')hotelSearches(@Req()req:PrincipalRequest,@Param('id')id:string){return this.hotelSearch.list(id,owner(req));}
  @Post('trips/:id/hotel-search')findHotels(@Req()req:PrincipalRequest,@Param('id')id:string,@Body()body:unknown){return this.hotelSearch.search(id,owner(req),body);}
  @Post('trips/:id/flight-shortlist')shortlistFlight(@Req()req:PrincipalRequest,@Param('id')id:string,@Body()body:unknown){return this.flightSearch.shortlist(id,owner(req),body);}
  @Get('trips/:id/flight-search')flightSearches(@Req()req:PrincipalRequest,@Param('id')id:string){return this.flightSearch.list(id,owner(req));}
  @Post('trips/:id/flight-search')findFlightFares(@Req()req:PrincipalRequest,@Param('id')id:string,@Body()body:unknown){return this.flightSearch.search(id,owner(req),body);}
  @Get('operations/runtime')runtimeStatus(){return this.runtime.status();}
  @Get('operations/attention')attention(@Req()req:PrincipalRequest){return this.release.attention(owner(req));}
  @Get('trips/:id/report')tripReport(@Req()req:PrincipalRequest,@Param('id')id:string){return this.release.report(id,owner(req));}
  @Get('operations')operations(@Req()req:PrincipalRequest){return this.notifications.operations(owner(req));}
  @Post('trips/:id/remove')removeTrip(@Req()req:PrincipalRequest,@Param('id')id:string,@Body()body:unknown){return this.notifications.removeTrip(owner(req),id,body);}
  @Get('health')async health(){let database='unavailable';let timer:ReturnType<typeof setTimeout>|undefined;try{await Promise.race([prisma.$queryRaw`SELECT 1`,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Database probe timed out')),2000);})]);database='connected';}catch{}finally{if(timer)clearTimeout(timer);}return{service:'TripSaathi',mode:'demo',database,tinyfishConfigured:Boolean(process.env.TINYFISH_API_KEY),execution:'SANDBOX_ONLY',authentication:process.env.AUTH_MODE==='clerk'?'CLERK_SESSION':process.env.AUTH_MODE==='oidc'?'OIDC_BEARER':'LOCAL_DEMO_ONLY'};}
  @Get('providers')providers(){return providerCapabilities(Boolean(process.env.TINYFISH_API_KEY),Boolean(process.env.FLIGHTAWARE_API_KEY),Boolean(process.env.AIRLABS_API_KEY),Boolean(process.env.SERPAPI_API_KEY));}
  @Get('trips/:id/monitoring')monitors(@Req()req:PrincipalRequest,@Param('id')id:string){return this.monitoring.list(id,owner(req));}
  @Post('trips/:id/items/:itemId/monitoring')enableMonitor(@Req()req:PrincipalRequest,@Param('id')id:string,@Param('itemId')itemId:string,@Body()body:unknown){return this.monitoring.enable(id,itemId,owner(req),body);}
  @Post('trips/:id/items/:itemId/monitoring/pause')pauseMonitor(@Req()req:PrincipalRequest,@Param('id')id:string,@Param('itemId')itemId:string){return this.monitoring.pause(id,itemId,owner(req));}
  @Post('trips/:id/items/:itemId/monitoring/check')checkMonitor(@Req()req:PrincipalRequest,@Param('id')id:string,@Param('itemId')itemId:string){return this.monitoring.check(id,itemId,owner(req));}
  @Sse('trips/:id/events/stream')async stream(@Req()req:PrincipalRequest,@Param('id')id:string,@Query('cursor')cursor?:string){
    await this.trips.get(id,owner(req));let after=Number(cursor??req.headers['last-event-id']??0);if(!Number.isSafeInteger(after)||after<0)after=0;
    return interval(2000).pipe(startWith(0),concatMap(async()=>{await this.trips.get(id,owner(req));const events=await prisma.tripEvent.findMany({where:{tripId:id,id:{gt:after}},orderBy:{id:'asc'},take:100});if(events.length)after=events.at(-1)!.id;return{id:String(after),type:'trip-events',data:{events,cursor:after}};}));
  }
  @Post('callbacks/tinyfish/:taskId/:token')async callback(@Param('taskId')taskId:string,@Param('token')token:string,@Body()body:unknown){
    const input=parsed(z.object({run_id:z.string(),event:z.enum(['run.completed','run.failed','run.cancelled'])}),body);
    const task=await prisma.agentTask.findUnique({where:{id:taskId}});const expected=task?.callbackToken;
    if(!expected||!/^[a-f0-9]{64}$/.test(token)||token.length!==expected.length||!timingSafeEqual(Buffer.from(token),Buffer.from(expected))||task?.runId!==input.run_id)throw new UnauthorizedException();
    // Callback payload is a hint only. Worker fetches the result through authenticated TinyFish API.
    if(task.status==='RUNNING')await prisma.agentTask.update({where:{id:taskId},data:{updatedAt:new Date()}});return{acknowledged:true};
  }
  @Get('trips')list(@Req()req:PrincipalRequest){return this.trips.list(owner(req));}
  @Post('trips')create(@Req()req:PrincipalRequest,@Body()body:unknown){return this.trips.create(parsed(createTripSchema,body),owner(req));}
  @Post('demo-trips')demo(@Req()req:PrincipalRequest,@Body()body:unknown){const input=parsed(z.object({category:z.enum(['FLIGHT','RAIL'])}),body);return this.trips.create(demoTrip(input.category),owner(req),true);}
  @Get('trips/:id')get(@Req()req:PrincipalRequest,@Param('id')id:string){return this.trips.get(id,owner(req));}
  @Post('trips/:id/items')addItem(@Req()req:PrincipalRequest,@Param('id')id:string,@Body()body:unknown){return this.trips.addItem(id,owner(req),body);}
  @Patch('trips/:id/items/:itemId')editItem(@Req()req:PrincipalRequest,@Param('id')id:string,@Param('itemId')itemId:string,@Body()body:unknown){return this.trips.editItem(id,itemId,owner(req),body);}
  @Post('trips/:id/items/:itemId/remove')removeItem(@Req()req:PrincipalRequest,@Param('id')id:string,@Param('itemId')itemId:string,@Body()body:unknown){return this.trips.removeItem(id,itemId,owner(req),body);}
  @Post('trips/:id/connections')connect(@Req()req:PrincipalRequest,@Param('id')id:string,@Body()body:unknown){return this.trips.connect(id,owner(req),body);}
  @Post('trips/:id/connections/:connectionId/remove')disconnect(@Req()req:PrincipalRequest,@Param('id')id:string,@Param('connectionId')connectionId:string,@Body()body:unknown){return this.trips.disconnect(id,connectionId,owner(req),body);}
  @Post('trips/:id/replay')replay(@Req()req:PrincipalRequest,@Param('id')id:string,@Body()body:unknown){return this.trips.replay(id,owner(req),body);}
  @Post('trips/:id/recovery')recovery(@Req()req:PrincipalRequest,@Param('id')id:string){return this.trips.recovery(id,owner(req));}
  @Post('plans/:id/approve')approve(@Req()req:PrincipalRequest,@Param('id')id:string,@Body()body:unknown){return this.trips.approve(id,owner(req),body);}
  @Post('plans/:id/withdraw')withdraw(@Req()req:PrincipalRequest,@Param('id')id:string,@Body()body:unknown){return this.workflow.withdraw(id,owner(req),body);}
  @Post('plans/:id/actions/:attemptId/report')report(@Req()req:PrincipalRequest,@Param('id')id:string,@Param('attemptId')attemptId:string,@Body()body:unknown){return this.workflow.report(id,attemptId,owner(req),body);}
  @Post('plans/:id/explain')explain(@Req()req:PrincipalRequest,@Param('id')id:string){return this.workflow.explain(id,owner(req));}
  @Post('trips/:id/research')research(@Req()req:PrincipalRequest,@Param('id')id:string,@Body()body:unknown){return this.trips.research(id,owner(req),body);}
}
@Module({controllers:[TripsController],providers:[TripsService,MonitoringService,WorkflowService,ImportsService,NotificationsService,RuntimeService,ReleaseService,ResearchRecoveryService,FlightSearchService,HotelSearchService]})class AppModule{}
async function bootstrap(){
  if(process.env.APP_MODE!=='demo')throw new Error('This release remains localhost-only. Remote deployment is not enabled.');
  const identity=identityConfig(process.env);const app=await NestFactory.create(AppModule);app.useGlobalGuards(new IdentityGuard(identity));
  app.use((_req:unknown,res:Response,next:()=>void)=>{res.setHeader('X-Request-Id',randomUUID());res.setHeader('Cache-Control','no-store');next();});
  app.enableCors({origin:[process.env.WEB_ORIGIN||'http://localhost:3000','http://127.0.0.1:3000']});
  const document=SwaggerModule.createDocument(app,new DocumentBuilder().setTitle('TripSaathi itinerary/recovery API').setVersion('0.2.0').addBearerAuth().build());SwaggerModule.setup('docs',app,document);
  await app.listen(Number(process.env.API_PORT||4000),'127.0.0.1');console.log(`TripSaathi API: http://127.0.0.1:4000/docs (identity: ${identity.mode}; localhost only)`);
}
if(require.main===module)bootstrap().catch(error=>{console.error(error.message);process.exitCode=1;});







