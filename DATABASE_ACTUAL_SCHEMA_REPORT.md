# ACTUAL DATABASE SCHEMA - DAILY SALES REPORT MAPPING

Generated: 2025-11-27T05:25:17.926Z

---

## flat_daily_sales_report

**Actual Table Name:** `flat_daily_sales_report`
**Row Count:** 1,43,33,716

### Columns

| Column Name | Data Type | Nullable | Max Length | Default |
|-------------|-----------|----------|------------|----------|
| id | bigint(64) | NO | - | nextval('flat_daily_sales_report_id_seq'::regclass) |
| trx_trxcode | character varying(50) | NO | 50 | NULL |
| trx_orgcode | character varying(50) | NO | 50 | NULL |
| trx_usercode | character varying(50) | YES | 50 | NULL |
| trx_clientcode | character varying(50) | YES | 50 | NULL |
| trx_trxdate | timestamp without time zone | YES | - | NULL |
| trx_trxtype | integer(32) | YES | - | NULL |
| trx_currencycode | character varying(50) | YES | 50 | NULL |
| trx_paymenttype | integer(32) | YES | - | NULL |
| trx_totalamount | double precision(53) | YES | - | NULL |
| trx_totaldiscountamount | double precision(53) | YES | - | NULL |
| trx_totaltaxamount | double precision(53) | YES | - | NULL |
| trx_status | integer(32) | YES | - | NULL |
| trx_createdon | timestamp without time zone | NO | - | NULL |
| trx_trxstatus | integer(32) | YES | - | NULL |
| trx_lpocode | character varying(50) | YES | 50 | NULL |
| trx_deliverynumber | character varying(50) | YES | 50 | NULL |
| trx_invoicenumber | character varying(50) | YES | 50 | NULL |
| trx_routecode | character varying(50) | YES | 50 | NULL |
| trx_tripdate | timestamp without time zone | YES | - | NULL |
| line_lineno | integer(32) | NO | - | NULL |
| line_itemcode | character varying(50) | NO | 50 | NULL |
| line_baseprice | double precision(53) | YES | - | NULL |
| line_uom | character varying(20) | NO | 20 | NULL |
| line_quantitybu | double precision(53) | YES | - | NULL |
| line_quantitysu | double precision(53) | YES | - | NULL |
| line_taxpercentage | double precision(53) | YES | - | NULL |
| line_totaldiscountpercentage | double precision(53) | YES | - | NULL |
| line_totaldiscountamount | double precision(53) | YES | - | NULL |
| line_itemdescription | character varying(100) | YES | 100 | NULL |
| line_itemaltdescription | character varying(100) | YES | 100 | NULL |
| line_promoid | numeric | YES | - | NULL |
| line_promotype | character varying(50) | YES | 50 | NULL |
| line_expirydate | timestamp without time zone | YES | - | NULL |
| line_batchnumber | character varying(50) | YES | 50 | NULL |
| line_taxamount | double precision(53) | YES | - | NULL |
| customer_code | character varying(50) | YES | 50 | NULL |
| customer_description | character varying(200) | YES | 200 | NULL |
| customer_parentcode | character varying(50) | YES | 50 | NULL |
| customer_citycode | character varying(200) | YES | 200 | NULL |
| customer_regioncode | character varying(50) | YES | 50 | NULL |
| customer_isactive | boolean | YES | - | NULL |
| customer_customerarabicname | character varying(400) | YES | 400 | NULL |
| customer_divisionname | character varying(200) | YES | 200 | NULL |
| customer_groupname | character varying(200) | YES | 200 | NULL |
| customer_subclassification | character varying(200) | YES | 200 | NULL |
| customer_zone | character varying(200) | YES | 200 | NULL |
| customer_type | character varying(10) | YES | 10 | NULL |
| customer_jdecustomertype | character varying(50) | YES | 50 | NULL |
| customer_contactpersonname | character varying(200) | YES | 200 | NULL |
| customer_contactno1 | character varying(50) | YES | 50 | NULL |
| customer_contactno2 | character varying(50) | YES | 50 | NULL |
| customer_email | character varying(150) | YES | 150 | NULL |
| customer_address1 | character varying(200) | YES | 200 | NULL |
| customer_address2 | character varying(200) | YES | 200 | NULL |
| customer_address3 | character varying(200) | YES | 200 | NULL |
| customer_longitude | double precision(53) | YES | - | NULL |
| customer_latitude | double precision(53) | YES | - | NULL |
| customer_routecode | character varying(50) | YES | 50 | NULL |
| customer_salesmancode | character varying(50) | YES | 50 | NULL |
| customer_alternatecode | character varying(50) | YES | 50 | NULL |
| customer_channelcode | character varying(50) | YES | 50 | NULL |
| customer_channel_description | character varying(200) | YES | 200 | NULL |
| customer_subchannelcode | character varying(50) | YES | 50 | NULL |
| customer_subchannel_description | character varying(200) | YES | 200 | NULL |
| customer_subsubchannelcode | character varying(50) | YES | 50 | NULL |
| customer_subsubchannel_description | character varying(200) | YES | 200 | NULL |
| user_description | character varying(100) | YES | 100 | NULL |
| user_email | character varying(150) | YES | 150 | NULL |
| user_mobileno | character varying(50) | YES | 50 | NULL |
| user_isactive | boolean | YES | - | NULL |
| user_usertype | character varying(50) | YES | 50 | NULL |
| item_description | character varying(100) | YES | 100 | NULL |
| item_grouplevel1 | character varying(50) | YES | 50 | NULL |
| item_grouplevel2 | character varying(50) | YES | 50 | NULL |
| item_grouplevel3 | character varying(50) | YES | 50 | NULL |
| item_grouplevel4 | character varying(50) | YES | 50 | NULL |
| item_grouplevel5 | character varying(50) | YES | 50 | NULL |
| item_brand_description | character varying(250) | YES | 250 | NULL |
| item_subbrand_description | character varying(250) | YES | 250 | NULL |
| item_category_description | character varying(250) | YES | 250 | NULL |
| route_name | character varying(200) | YES | 200 | NULL |
| route_salesmancode | character varying(50) | YES | 50 | NULL |
| route_areacode | character varying(100) | YES | 100 | NULL |
| route_subareacode | character varying(100) | YES | 100 | NULL |
| route_isactive | boolean | YES | - | NULL |
| city_description | character varying(200) | YES | 200 | NULL |
| region_description | character varying(200) | YES | 200 | NULL |
| region_isactive | boolean | YES | - | NULL |
| warehouse_description | character varying(400) | YES | 400 | NULL |
| warehouse_isactive | boolean | YES | - | NULL |
| sync_created_at | timestamp without time zone | NO | - | CURRENT_TIMESTAMP |
| sync_updated_at | timestamp without time zone | NO | - | CURRENT_TIMESTAMP |

### Sample Data (First Row)

```json
{
  "id": "10046190",
  "trx_trxcode": "00020_112078457",
  "trx_orgcode": "00020",
  "trx_usercode": "332210",
  "trx_clientcode": "612053",
  "trx_trxdate": "2025-07-04T01:09:20.000Z",
  "trx_trxtype": 1,
  "trx_currencycode": "AED",
  "trx_paymenttype": 1,
  "trx_totalamount": 208.98
}
... (more fields)
```

---

# DAILY SALES REPORT - ACTUAL FIELD MAPPING

Based on actual database inspection.

