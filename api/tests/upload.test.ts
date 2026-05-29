import { parseMlc, parseCde, parseGap } from '../src/services/excelParser';
import * as XLSX from 'xlsx';

function makeBuffer(sheetData: object[], sheetName = 'Sheet1', extraSheets?: Record<string, object[]>): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetData), sheetName);
  if (extraSheets) {
    for (const [name, data] of Object.entries(extraSheets)) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), name);
    }
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('parseMlc', () => {
  it('parses machines and orgs from valid MLC buffer', () => {
    const machines = [
      {
        Pin: 'ABC123',
        'Org id': '1001',
        'Last Called In Date': '2024-01-01',
        'Machine Hour In Period': 1500,
        'Last Known Lat': -15.5,
        'Last Known Long': -47.8,
        'Last Called In': '61 to 365 days',
      },
    ];
    const orgs = [
      { 'Org Id': '1001', 'Org Name': 'Fazenda Boa Esperança' },
    ];

    const buf = makeBuffer(machines, 'Sheet1', { 'Organização': orgs });
    const result = parseMlc(buf);

    expect(result.machines).toHaveLength(1);
    expect(result.machines[0].pin).toBe('ABC123');
    expect(result.machines[0].machineHours).toBe(1500);
    expect(result.orgs).toHaveLength(1);
    expect(result.orgs[0].orgName).toBe('Fazenda Boa Esperança');
  });

  it('skips rows without PIN', () => {
    const machines = [
      { Pin: '', 'Org id': '1001', 'Last Called In Date': '2024-01-01' },
      { Pin: 'DEF456', 'Org id': '1001', 'Last Called In Date': '2024-01-01' },
    ];
    const buf = makeBuffer(machines, 'Sheet1', { 'Organização': [] });
    const result = parseMlc(buf);
    expect(result.machines).toHaveLength(1);
    expect(result.machines[0].pin).toBe('DEF456');
  });
});

describe('parseGap', () => {
  it('parses gap data correctly', () => {
    const rows = [
      {
        'Org Id': '2001',
        'Org Name': 'Fazenda Santa Cruz',
        'Máx. EH': 500,
        'YTD HE': 300,
        'Gap EH': 200,
        'Max Harvest': 1000,
        'YTD Harvest': 600,
        'Gap Harvest': 400,
      },
    ];
    const buf = makeBuffer(rows);
    const result = parseGap(buf);
    expect(result).toHaveLength(1);
    expect(result[0].orgId).toBe('2001');
    expect(result[0].maxEh).toBe(500);
    expect(result[0].gapHarvest).toBe(400);
  });
});
