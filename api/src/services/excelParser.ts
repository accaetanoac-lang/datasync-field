import * as XLSX from 'xlsx';

export interface MlcMachineRow {
  pin: string;
  orgId: string;
  lastCalledInDate: Date | null;
  machineHours: number | null;
  lastKnownLat: number | null;
  lastKnownLng: number | null;
  lastCalledIn: string;
}

export interface MlcOrgRow {
  orgId: string;
  orgName: string;
}

export interface MlcData {
  machines: MlcMachineRow[];
  orgs: MlcOrgRow[];
}

export interface CdeRow {
  orgId: string;
  orgName: string;
  engagementLevel: string;
  allModems: number | null;
  nonActiveModems: number | null;
  lgAgModems: number | null;
  lgAgNotSubmitting: number | null;
  lgAgConnectedGen45: number | null;
  riskAcres: number | null;
  highlyEngagedAcres: number | null;
  prepareAcres: number | null;
  plantAcres: number | null;
  applyAcres: number | null;
  harvestAcres: number | null;
  vcaSetupFile: boolean;
  vcaWorkPlan: boolean;
  vcaFieldBoundary: boolean;
  vcaEquipmentMonitoring: boolean;
  vcaWorkDetails: boolean;
  vcaAgronomicReports: boolean;
  r12VcaAvg: number | null;
  workPlansCreated: number | null;
  workPlansCompleted: number | null;
  fieldsWithoutBoundaries: number | null;
  lastLoginWeb: string;
  lastLoginMobile: string;
}

export interface GapRow {
  orgId: string;
  orgName: string;
  maxEh: number | null;
  ytdHe: number | null;
  gapEh: number | null;
  maxHeh: number | null;
  ytdHeh: number | null;
  gapHeh: number | null;
  maxPrepare: number | null;
  ytdPrepare: number | null;
  gapPrepare: number | null;
  maxPlant: number | null;
  ytdPlant: number | null;
  gapPlant: number | null;
  maxApply: number | null;
  ytdApply: number | null;
  gapApply: number | null;
  maxHarvest: number | null;
  ytdHarvest: number | null;
  gapHarvest: number | null;
}

function toNum(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

function toStr(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

function toBool(val: unknown): boolean {
  const s = toStr(val).toLowerCase();
  return s === 'y' || s === 'yes' || s === 'true' || s === '1';
}

function excelDateToJs(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === 'number') {
    return new Date(Math.round((val - 25569) * 86400 * 1000));
  }
  if (typeof val === 'string') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[\s\-\/]+/g, '_').replace(/[^a-z0-9_]/g, '');
}

function findCol(row: Record<string, unknown>, ...candidates: string[]): unknown {
  for (const c of candidates) {
    if (c in row) return row[c];
    const norm = normalizeHeader(c);
    const found = Object.keys(row).find((k) => normalizeHeader(k) === norm);
    if (found) return row[found];
  }
  return undefined;
}

export function parseMlc(buffer: Buffer): MlcData {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });

  // Sheet 1 — machines
  const sheet1Name = workbook.SheetNames[0];
  const sheet1 = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    workbook.Sheets[sheet1Name],
    { defval: null }
  );

  const machines: MlcMachineRow[] = sheet1.map((row) => ({
    pin: toStr(findCol(row, 'Pin', 'PIN', 'pin')),
    orgId: toStr(findCol(row, 'Org id', 'Org Id', 'org_id', 'OrgId')),
    lastCalledInDate: excelDateToJs(findCol(row, 'Last Called In Date', 'Last_Called_In_Date')),
    machineHours: toNum(findCol(row, 'Machine Hour In Period', 'Machine_Hour_In_Period', 'MachineHourInPeriod')),
    lastKnownLat: toNum(findCol(row, 'Last Known Lat', 'Last_Known_Lat', 'LastKnownLat')),
    lastKnownLng: toNum(findCol(row, 'Last Known Long', 'Last_Known_Long', 'LastKnownLong', 'Last Known Lng')),
    lastCalledIn: toStr(findCol(row, 'Last Called In', 'Last_Called_In', 'LastCalledIn')),
  })).filter((m) => m.pin !== '');

  // Organização sheet
  const orgSheetName = workbook.SheetNames.find((n) =>
    n.toLowerCase().includes('organ') || n.toLowerCase() === 'organização'
  ) ?? workbook.SheetNames[1];

  const orgSheet = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    workbook.Sheets[orgSheetName],
    { defval: null }
  );

  const orgs: MlcOrgRow[] = orgSheet.map((row) => ({
    orgId: toStr(findCol(row, 'Org Id', 'Org ID', 'org_id', 'OrgId')),
    orgName: toStr(findCol(row, 'Org Name', 'OrgName', 'org_name', 'Name')),
  })).filter((o) => o.orgId !== '');

  return { machines, orgs };
}

export function parseCde(buffer: Buffer): CdeRow[] {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    workbook.Sheets[sheetName],
    { defval: null }
  );

  return sheet.map((row) => ({
    orgId: toStr(findCol(row, 'Org ID', 'Org Id', 'org_id')),
    orgName: toStr(findCol(row, 'Org Name', 'OrgName', 'org_name')),
    engagementLevel: toStr(findCol(row, 'Engagement Level', 'EngagementLevel')),
    allModems: toNum(findCol(row, 'All Modems', 'AllModems')),
    nonActiveModems: toNum(findCol(row, 'Non-Active JDLink Modems', 'Non_Active_JDLink_Modems')),
    lgAgModems: toNum(findCol(row, 'Lg Ag Mach JDLink Modems', 'Lg_Ag_Mach_JDLink_Modems')),
    lgAgNotSubmitting: toNum(findCol(row, 'Lg Ag Not Submitting Agronomic Data', 'Lg_Ag_Not_Submitting_Agronomic_Data')),
    lgAgConnectedGen45: toNum(findCol(row, 'Lg Ag Connected Mach Gen4/G5', 'Lg_Ag_Connected_Mach_Gen4_G5')),
    riskAcres: toNum(findCol(row, 'Risk Acres', 'RiskAcres')),
    highlyEngagedAcres: toNum(findCol(row, 'Highly Engaged Acres', 'HighlyEngagedAcres')),
    prepareAcres: toNum(findCol(row, 'Prepare Acres', 'PrepareAcres')),
    plantAcres: toNum(findCol(row, 'Plant Acres', 'PlantAcres')),
    applyAcres: toNum(findCol(row, 'Apply Acres', 'ApplyAcres')),
    harvestAcres: toNum(findCol(row, 'Harvest Acres', 'HarvestAcres')),
    vcaSetupFile: toBool(findCol(row, 'VCA - Setup File', 'VCA_Setup_File')),
    vcaWorkPlan: toBool(findCol(row, 'VCA - Work Plan', 'VCA_Work_Plan')),
    vcaFieldBoundary: toBool(findCol(row, 'VCA - Field / Line / Boundary / Flag', 'VCA_Field_Boundary')),
    vcaEquipmentMonitoring: toBool(findCol(row, 'VCA - Equipment Monitoring', 'VCA_Equipment_Monitoring')),
    vcaWorkDetails: toBool(findCol(row, 'VCA - Work Details or Map', 'VCA_Work_Details')),
    vcaAgronomicReports: toBool(findCol(row, 'VCA - Agronomic or Machine Reports', 'VCA_Agronomic_Reports')),
    r12VcaAvg: toNum(findCol(row, 'Média de R12 Value Creating Actions', 'R12_VCA_Avg', 'Media_de_R12_Value_Creating_Actions')),
    workPlansCreated: toNum(findCol(row, 'Work Plans Created (R12)', 'WorkPlansCreated')),
    workPlansCompleted: toNum(findCol(row, 'Work Plans Completed (R12)', 'WorkPlansCompleted')),
    fieldsWithoutBoundaries: toNum(findCol(row, 'Fields without Boundaries', 'FieldsWithoutBoundaries')),
    lastLoginWeb: toStr(findCol(row, 'Last Login Ops Center Web', 'LastLoginWeb')),
    lastLoginMobile: toStr(findCol(row, 'Last Login Ops Center Mobile', 'LastLoginMobile')),
  })).filter((r) => r.orgId !== '');
}

export function parseGap(buffer: Buffer): GapRow[] {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    workbook.Sheets[sheetName],
    { defval: null }
  );

  return sheet.map((row) => ({
    orgId: toStr(findCol(row, 'Org Id', 'Org ID', 'org_id')),
    orgName: toStr(findCol(row, 'Org Name', 'OrgName', 'org_name')),
    maxEh: toNum(findCol(row, 'Máx. EH', 'Max. EH', 'Max_EH', 'MaxEH')),
    ytdHe: toNum(findCol(row, 'YTD HE', 'YTD_HE', 'YTDHE')),
    gapEh: toNum(findCol(row, 'Gap EH', 'GAP EH', 'Gap_EH')),
    maxHeh: toNum(findCol(row, 'Máx. HEH', 'Max. HEH', 'Max_HEH')),
    ytdHeh: toNum(findCol(row, 'YTD HEH', 'YTD_HEH')),
    gapHeh: toNum(findCol(row, 'GAP HEH', 'Gap_HEH')),
    maxPrepare: toNum(findCol(row, 'Máx. Prepare', 'Max. Prepare', 'Max_Prepare')),
    ytdPrepare: toNum(findCol(row, 'YTD Prepare', 'YTD_Prepare')),
    gapPrepare: toNum(findCol(row, 'GAP Prepare', 'Gap_Prepare')),
    maxPlant: toNum(findCol(row, 'Máx. Plant', 'Max. Plant', 'Max_Plant')),
    ytdPlant: toNum(findCol(row, 'YTD Plant', 'YTD_Plant')),
    gapPlant: toNum(findCol(row, 'GAP Plant', 'Gap_Plant')),
    maxApply: toNum(findCol(row, 'Máx. Apply', 'Max. Apply', 'Max_Apply')),
    ytdApply: toNum(findCol(row, 'YTD Apply', 'YTD_Apply')),
    gapApply: toNum(findCol(row, 'Gap Apply', 'GAP Apply', 'Gap_Apply')),
    maxHarvest: toNum(findCol(row, 'Max Harvest', 'Max_Harvest')),
    ytdHarvest: toNum(findCol(row, 'YTD Harvest', 'YTD_Harvest')),
    gapHarvest: toNum(findCol(row, 'Gap Harvest', 'GAP Harvest', 'Gap_Harvest')),
  })).filter((r) => r.orgId !== '');
}
