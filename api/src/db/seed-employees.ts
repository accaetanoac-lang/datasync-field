import { pool } from './client';
import dotenv from 'dotenv';

dotenv.config();

const employees = [
  { employee_id: 'x893272', name: 'Leonardo Santos',          role: 'technician' },
  { employee_id: 'x148072', name: 'Lucas Campos',             role: 'technician' },
  { employee_id: 'x136766', name: 'Adeilson Oliveira',        role: 'technician' },
  { employee_id: 'x349652', name: 'Anderson Duarte Freitas',  role: 'technician' },
  { employee_id: 'x629436', name: 'Antonio Caetano',          role: 'technician' },
  { employee_id: 'x805262', name: 'Antonio Santos',           role: 'technician' },
  { employee_id: 'x673575', name: 'Bruno Da Silva Thome',     role: 'technician' },
  { employee_id: 'x930720', name: 'Clenison Souza',           role: 'technician' },
  { employee_id: 'x268581', name: 'Daniel Oliveira',          role: 'technician' },
  { employee_id: 'x827720', name: 'Dhone Silva',              role: 'technician' },
  { employee_id: 'x492715', name: 'Edilson Junior',           role: 'technician' },
  { employee_id: 'x269332', name: 'Filipe Souza',             role: 'technician' },
  { employee_id: 'x707797', name: 'Gabriel Vieira',           role: 'technician' },
  { employee_id: 'x597130', name: 'Geoglen Parra',            role: 'technician' },
  { employee_id: 'x025172', name: 'Jaime Coelho',             role: 'technician' },
  { employee_id: 'x649373', name: 'Jose Neto',                role: 'technician' },
  { employee_id: 'x686861', name: 'Kaio Oliveira',            role: 'technician' },
  { employee_id: 'x774327', name: 'Lucas Ribeiro',            role: 'technician' },
  { employee_id: 'x716833', name: 'Marinilson Lira',          role: 'technician' },
  { employee_id: 'x754182', name: 'Rayan Mendes',             role: 'technician' },
  { employee_id: 'x756176', name: 'Rocio Diaz',               role: 'technician' },
  { employee_id: 'x821709', name: 'Phillip Persaud',          role: 'technician' },
  { employee_id: 'x092817', name: 'Lucas Nascimento',         role: 'technician' },
  { employee_id: 'x117956', name: 'Matheus Oliveira',         role: 'technician' },
  { employee_id: 'x820806', name: 'Nicollas Sousa',           role: 'technician' },
  { employee_id: 'x122138', name: 'Lucas Persch',             role: 'technician' },
];

async function seedEmployees(): Promise<void> {
  const client = await pool.connect();
  try {
    for (const emp of employees) {
      await client.query(
        `INSERT INTO technicians (employee_id, name, role, active)
         VALUES ($1, $2, $3, TRUE)
         ON CONFLICT (employee_id) DO UPDATE
           SET name = EXCLUDED.name,
               role = EXCLUDED.role,
               active = TRUE`,
        [emp.employee_id, emp.name, emp.role]
      );
      console.log(`✓ ${emp.employee_id}  ${emp.name}`);
    }
    console.log(`\nDone! ${employees.length} employees inserted.`);
  } finally {
    client.release();
    await pool.end();
  }
}

seedEmployees().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
