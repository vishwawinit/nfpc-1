// Database Schema Inspection Script
// Run this with: node inspect_database.js

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');

// Database configuration from environment
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

console.log('Database config:', {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  hasPassword: !!process.env.DB_PASSWORD
});

async function inspectDatabase() {
  try {
    console.log('🔍 Starting database inspection...\n');

    // 1. Get all tables
    console.log('📋 Step 1: Getting all tables...');
    const tablesResult = await pool.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);
    const tables = tablesResult.rows.map(r => r.tablename);
    console.log(`✅ Found ${tables.length} tables\n`);
    console.log('📋 All tables in database:');
    tables.forEach(t => console.log(`   - ${t}`));
    console.log('');

    // 2. Find transaction-related tables
    const transactionTables = tables.filter(t =>
      t.toLowerCase().includes('trx') ||
      t.toLowerCase().includes('transaction') ||
      t.toLowerCase().includes('detail') ||
      t.toLowerCase().includes('header')
    );
    console.log('📊 Transaction-related tables:');
    transactionTables.forEach(t => console.log(`   - ${t}`));
    console.log('');

    // 3. Inspect ALL tables in the database
    console.log('🔍 Inspecting all tables...\n');
    const schema = {};

    for (const tableName of tables) {
      try {
        // Check if table exists (case-insensitive)
        const existsResult = await pool.query(`
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = 'public'
          AND LOWER(table_name) = LOWER($1)
        `, [tableName]);

        if (existsResult.rows.length === 0) {
          console.log(`⚠️  Table ${tableName} not found, skipping...`);
          continue;
        }

        const actualTableName = existsResult.rows[0].table_name;
        console.log(`\n🔍 Inspecting: ${actualTableName}`);

        // Get columns
        const columnsResult = await pool.query(`
          SELECT
            column_name,
            data_type,
            character_maximum_length,
            numeric_precision,
            numeric_scale,
            is_nullable,
            column_default
          FROM information_schema.columns
          WHERE table_name = $1
          AND table_schema = 'public'
          ORDER BY ordinal_position
        `, [actualTableName]);

        // Get row count
        let rowCount = 0;
        try {
          const countResult = await pool.query(`SELECT COUNT(*) as count FROM "${actualTableName}"`);
          rowCount = parseInt(countResult.rows[0].count);
        } catch (err) {
          console.log(`   ⚠️  Could not get row count: ${err.message}`);
        }

        // Get sample data (first row)
        let sampleData = null;
        try {
          const sampleResult = await pool.query(`SELECT * FROM "${actualTableName}" LIMIT 1`);
          sampleData = sampleResult.rows[0] || null;
        } catch (err) {
          console.log(`   ⚠️  Could not get sample data: ${err.message}`);
        }

        schema[actualTableName] = {
          actualName: actualTableName,
          columns: columnsResult.rows,
          rowCount,
          sampleData
        };

        console.log(`   ✅ Columns: ${columnsResult.rows.length}`);
        console.log(`   ✅ Rows: ${rowCount.toLocaleString()}`);
        console.log(`   📝 Key columns: ${columnsResult.rows.slice(0, 5).map(c => c.column_name).join(', ')}`);

      } catch (error) {
        console.log(`   ❌ Error inspecting ${tableName}: ${error.message}`);
      }
    }

    // 4. Generate detailed report
    console.log('\n\n📄 Generating detailed report...\n');

    let report = '# ACTUAL DATABASE SCHEMA - DAILY SALES REPORT MAPPING\n\n';
    report += `Generated: ${new Date().toISOString()}\n\n`;
    report += '---\n\n';

    for (const [tableName, tableInfo] of Object.entries(schema)) {
      report += `## ${tableName}\n\n`;
      report += `**Actual Table Name:** \`${tableInfo.actualName}\`\n`;
      report += `**Row Count:** ${tableInfo.rowCount.toLocaleString()}\n\n`;

      report += '### Columns\n\n';
      report += '| Column Name | Data Type | Nullable | Max Length | Default |\n';
      report += '|-------------|-----------|----------|------------|----------|\n';

      for (const col of tableInfo.columns) {
        const dataType = col.character_maximum_length
          ? `${col.data_type}(${col.character_maximum_length})`
          : col.numeric_precision
          ? `${col.data_type}(${col.numeric_precision}${col.numeric_scale ? ',' + col.numeric_scale : ''})`
          : col.data_type;

        report += `| ${col.column_name} | ${dataType} | ${col.is_nullable} | `;
        report += `${col.character_maximum_length || '-'} | ${col.column_default || 'NULL'} |\n`;
      }

      report += '\n';

      // Add sample data snippet
      if (tableInfo.sampleData) {
        report += '### Sample Data (First Row)\n\n';
        report += '```json\n';
        // Show first 10 fields only
        const sampleKeys = Object.keys(tableInfo.sampleData).slice(0, 10);
        const sampleObj = {};
        sampleKeys.forEach(key => {
          sampleObj[key] = tableInfo.sampleData[key];
        });
        report += JSON.stringify(sampleObj, null, 2);
        if (Object.keys(tableInfo.sampleData).length > 10) {
          report += '\n... (more fields)';
        }
        report += '\n```\n\n';
      }

      report += '---\n\n';
    }

    // 5. Add Daily Sales Report Field Mapping
    report += '# DAILY SALES REPORT - ACTUAL FIELD MAPPING\n\n';
    report += 'Based on actual database inspection.\n\n';

    // Check what we actually have
    const hasTrxHeader = !!schema['tblTrxHeader'];
    const hasTrxDetail = !!schema['tblTrxDetail'];

    if (hasTrxHeader) {
      report += '## Transaction Header (tblTrxHeader)\n\n';
      report += 'Available columns for Daily Sales Report:\n\n';
      const trxHeaderCols = schema['tblTrxHeader'].columns.map(c => c.column_name);
      trxHeaderCols.forEach(col => {
        report += `- \`${col}\`\n`;
      });
      report += '\n';
    }

    if (hasTrxDetail) {
      report += '## Transaction Detail (tblTrxDetail)\n\n';
      report += 'Available columns for Product Analysis:\n\n';
      const trxDetailCols = schema['tblTrxDetail'].columns.map(c => c.column_name);
      trxDetailCols.forEach(col => {
        report += `- \`${col}\`\n`;
      });
      report += '\n';
    }

    // Write report to file
    const reportPath = './DATABASE_ACTUAL_SCHEMA_REPORT.md';
    fs.writeFileSync(reportPath, report);
    console.log(`\n✅ Report saved to: ${reportPath}`);

    // Write JSON schema for programmatic access
    const jsonPath = './database_schema.json';
    fs.writeFileSync(jsonPath, JSON.stringify(schema, null, 2));
    console.log(`✅ JSON schema saved to: ${jsonPath}`);

    console.log('\n✨ Database inspection complete!\n');

    // Return summary
    return {
      totalTables: tables.length,
      inspectedTables: Object.keys(schema).length,
      schema,
      report
    };

  } catch (error) {
    console.error('❌ Error during database inspection:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run inspection
if (require.main === module) {
  inspectDatabase()
    .then(() => {
      console.log('Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed:', error);
      process.exit(1);
    });
}

module.exports = { inspectDatabase };
