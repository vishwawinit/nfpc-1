/**
 * Database Schema Explorer for NFPC PostgreSQL Database
 * This script explores the entire database structure to understand tables and columns
 */

const { Pool } = require('pg');
const fs = require('fs');

// Database configuration
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'sfa_database',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

async function exploreDatabase() {
  try {
    console.log('🔍 Exploring NFPC PostgreSQL Database Structure...\n');
    
    // Get all tables
    const tablesQuery = `
      SELECT 
        schemaname,
        tablename,
        tableowner
      FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename
    `;
    
    const tablesResult = await pool.query(tablesQuery);
    const tables = tablesResult.rows;
    
    console.log(`📊 Found ${tables.length} tables in the database:\n`);
    
    let schemaInfo = {
      database: process.env.DB_NAME || 'sfa_database',
      explorationDate: new Date().toISOString(),
      totalTables: tables.length,
      tables: {}
    };
    
    // Explore each table
    for (const table of tables) {
      const tableName = table.tablename;
      console.log(`\n🗃️  Exploring table: ${tableName}`);
      
      // Get table schema
      const schemaQuery = `
        SELECT
          column_name,
          data_type,
          is_nullable,
          column_default,
          character_maximum_length,
          numeric_precision,
          numeric_scale,
          ordinal_position
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position
      `;
      
      const schemaResult = await pool.query(schemaQuery, [tableName]);
      const columns = schemaResult.rows;
      
      // Get row count (with error handling for large tables)
      let rowCount = 0;
      try {
        const countQuery = `SELECT COUNT(*) as count FROM ${tableName}`;
        const countResult = await pool.query(countQuery);
        rowCount = parseInt(countResult.rows[0].count);
      } catch (error) {
        console.log(`   ⚠️  Could not get row count for ${tableName}: ${error.message}`);
        rowCount = 'Unknown';
      }
      
      // Get sample data (first 3 rows)
      let sampleData = [];
      try {
        const sampleQuery = `SELECT * FROM ${tableName} LIMIT 3`;
        const sampleResult = await pool.query(sampleQuery);
        sampleData = sampleResult.rows;
      } catch (error) {
        console.log(`   ⚠️  Could not get sample data for ${tableName}: ${error.message}`);
      }
      
      console.log(`   📝 Columns: ${columns.length}`);
      console.log(`   📊 Rows: ${rowCount}`);
      
      // Store table information
      schemaInfo.tables[tableName] = {
        rowCount,
        columnCount: columns.length,
        columns: columns.map(col => ({
          name: col.column_name,
          type: col.data_type,
          nullable: col.is_nullable === 'YES',
          default: col.column_default,
          maxLength: col.character_maximum_length,
          precision: col.numeric_precision,
          scale: col.numeric_scale,
          position: col.ordinal_position
        })),
        sampleData: sampleData.map(row => {
          // Convert each row to show only first few characters for large fields
          const cleanRow = {};
          Object.keys(row).forEach(key => {
            const value = row[key];
            if (typeof value === 'string' && value.length > 50) {
              cleanRow[key] = value.substring(0, 50) + '...';
            } else {
              cleanRow[key] = value;
            }
          });
          return cleanRow;
        })
      };
      
      // Display key columns for important tables
      if (tableName.includes('flat_') || tableName.includes('transaction') || tableName.includes('customer') || tableName.includes('product')) {
        console.log(`   🔑 Key columns:`);
        columns.slice(0, 10).forEach(col => {
          console.log(`      - ${col.column_name} (${col.data_type}${col.is_nullable === 'NO' ? ', NOT NULL' : ''})`);
        });
        if (columns.length > 10) {
          console.log(`      ... and ${columns.length - 10} more columns`);
        }
      }
    }
    
    // Generate comprehensive schema report
    const reportContent = generateSchemaReport(schemaInfo);
    fs.writeFileSync('DATABASE_SCHEMA_REPORT.md', reportContent);
    
    console.log('\n✅ Database exploration complete!');
    console.log('📄 Detailed report saved to: DATABASE_SCHEMA_REPORT.md');
    
    // Focus on key tables for dashboard and reports
    const keyTables = tables.filter(t => 
      t.tablename.includes('flat_') || 
      t.tablename.includes('transaction') || 
      t.tablename.includes('customer') || 
      t.tablename.includes('product') ||
      t.tablename.includes('sales') ||
      t.tablename.includes('dashboard')
    );
    
    console.log(`\n🎯 Key tables for Dashboard & Reports (${keyTables.length}):`);
    keyTables.forEach(table => {
      const info = schemaInfo.tables[table.tablename];
      console.log(`   📋 ${table.tablename} - ${info.columnCount} columns, ${info.rowCount} rows`);
    });
    
    return schemaInfo;
    
  } catch (error) {
    console.error('❌ Error exploring database:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

function generateSchemaReport(schemaInfo) {
  let report = `# NFPC Database Schema Report

**Database:** ${schemaInfo.database}  
**Exploration Date:** ${schemaInfo.explorationDate}  
**Total Tables:** ${schemaInfo.totalTables}

## Table Overview

| Table Name | Columns | Rows | Type |
|------------|---------|------|------|
`;

  Object.entries(schemaInfo.tables).forEach(([tableName, tableInfo]) => {
    const tableType = tableName.includes('flat_') ? 'Flat Table' : 
                     tableName.includes('view_') ? 'View' : 
                     tableName.includes('temp_') ? 'Temporary' : 'Standard';
    report += `| ${tableName} | ${tableInfo.columnCount} | ${tableInfo.rowCount} | ${tableType} |\n`;
  });

  report += `\n## Key Tables for Dashboard & Reports\n\n`;

  // Focus on important tables
  const keyTableNames = Object.keys(schemaInfo.tables).filter(name => 
    name.includes('flat_') || 
    name.includes('transaction') || 
    name.includes('customer') || 
    name.includes('product') ||
    name.includes('sales') ||
    name.includes('dashboard')
  );

  keyTableNames.forEach(tableName => {
    const tableInfo = schemaInfo.tables[tableName];
    report += `### ${tableName}\n\n`;
    report += `**Rows:** ${tableInfo.rowCount}  \n`;
    report += `**Columns:** ${tableInfo.columnCount}\n\n`;
    
    report += `#### Column Structure\n\n`;
    report += `| Column | Type | Nullable | Default |\n`;
    report += `|--------|------|----------|----------|\n`;
    
    tableInfo.columns.forEach(col => {
      report += `| ${col.name} | ${col.type} | ${col.nullable ? 'Yes' : 'No'} | ${col.default || '-'} |\n`;
    });
    
    if (tableInfo.sampleData && tableInfo.sampleData.length > 0) {
      report += `\n#### Sample Data\n\n`;
      const sampleRow = tableInfo.sampleData[0];
      Object.entries(sampleRow).forEach(([key, value]) => {
        report += `- **${key}:** ${value}\n`;
      });
    }
    
    report += `\n---\n\n`;
  });

  return report;
}

// Run the exploration
if (require.main === module) {
  exploreDatabase()
    .then(schema => {
      console.log('\n🎉 Schema exploration completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Schema exploration failed:', error);
      process.exit(1);
    });
}

module.exports = { exploreDatabase };


