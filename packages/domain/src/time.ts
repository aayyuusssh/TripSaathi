import {Temporal} from '@js-temporal/polyfill';
export function localInputToInstant(local:string,timezone:string):string{
  const plain=Temporal.PlainDateTime.from(local);
  return plain.toZonedDateTime(timezone,{disambiguation:'reject'}).toInstant().toString({smallestUnit:'millisecond'});
}
export function instantToLocalInput(instant:string,timezone:string):string{return Temporal.Instant.from(instant).toZonedDateTimeISO(timezone).toPlainDateTime().toString({smallestUnit:'minute'});}
