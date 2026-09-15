export interface CdrRow {
  uniqueid: string;
  sequence?: string;
  clid?: string;
  src?: string;
  dst?: string;
  dstf?: string;
  dcontext?: string;
  channel?: string;
  dstchannel?: string;
  lastapp?: string;
  lastdata?: string;
  start?: string;
  answer?: string;
  end?: string;
  duration?: number;
  billsec?: number;
  disposition?: string;
  amaflags?: string;
  accountcode?: string;
  userfield?: string;
}

export const CSV_FIELDS = [
  'clid',
  'src',
  'dst',
  'dcontext',
  'channel',
  'dstchannel',
  'lastapp',
  'lastdata',
  'start',
  'answer',
  'end',
  'duration',
  'billsec',
  'disposition',
  'amaflags',
  'accountcode',
  'uniqueid',
  'userfield',
  'sequence',
  'dstf',
] as const;
