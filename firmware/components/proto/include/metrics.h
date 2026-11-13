#pragma once
#include <stdint.h>

typedef enum { GRP_METRICS = 0, GRP_HEALTH = 1, GRP_DIAG = 2 } metric_group_t;
typedef enum { KIND_NUM = 0, KIND_STATUS = 1 } metric_kind_t;
typedef enum { ST_OK = 0, ST_WARNING = 1, ST_FAULT = 2 } status_t;

#define METRIC_TABLE(X) \
  X( 1, M_PH,               "ph",                             GRP_METRICS,  KIND_NUM,     2) \
  X( 2, M_TURBIDITY_NTU,    "turbidity_ntu",                  GRP_METRICS,  KIND_NUM,     2) \
  X( 3, M_CHLORINE_MG_L,    "chlorine_mg_l",                  GRP_METRICS,  KIND_NUM,     2) \
  X( 4, M_FLOW_LPM,         "flow_lpm",                       GRP_METRICS,  KIND_NUM,     2) \
  X( 5, M_OBJECT_DETECTED,  "object_detected",                GRP_METRICS,  KIND_NUM,     0) \
  X( 6, M_WATER_TEMP_C,     "water_temp_c",                   GRP_METRICS,  KIND_NUM,     1) \
  X( 7, M_CONDUCTIVITY_TDS, "conductivity_tds",               GRP_METRICS,  KIND_NUM,     0) \
  X( 8, M_FLOW_TOTAL_L,     "flow_total_l",                   GRP_METRICS,  KIND_NUM,     3) \
  X( 9, M_AIR_TEMP_C,       "air_temp_c",                     GRP_METRICS,  KIND_NUM,     1) \
  X(10, M_AIR_HUMIDITY_PCT, "air_humidity_pct",               GRP_METRICS,  KIND_NUM,     0) \
  X(11, M_GAS_PPM,          "gas_ppm_co2eq",                  GRP_METRICS,  KIND_NUM,     0) \
  X(20, M_PH_ELECTRODE_MV,  "ph_electrode_mv",                GRP_HEALTH,   KIND_NUM,     1) \
  X(21, M_PH_STATUS,        "ph_status",                      GRP_HEALTH,   KIND_STATUS,  0) \
  X(22, M_TURB_LENS_PCT,    "turbidity_lens_cleanliness_pct", GRP_HEALTH,   KIND_NUM,     1) \
  X(23, M_TURB_STATUS,      "turbidity_status",               GRP_HEALTH,   KIND_STATUS,  0) \
  X(24, M_DAYS_SINCE_CAL,   "days_since_last_calibration",    GRP_HEALTH,   KIND_NUM,     0) \
  X(25, M_INTERNAL_TEMP_C,  "internal_temp_c",                GRP_HEALTH,   KIND_NUM,     1) \
  X(26, M_TURB_VOLTAGE_MV,  "turbidity_voltage_mv",           GRP_HEALTH,   KIND_NUM,     0) \
  X(27, M_TDS_VOLTAGE_MV,   "tds_voltage_mv",                 GRP_HEALTH,   KIND_NUM,     0) \
  X(28, M_TDS_STATUS,       "tds_status",                     GRP_HEALTH,   KIND_STATUS,  0) \
  X(29, M_DHT_STATUS,       "air_sensor_status",              GRP_HEALTH,   KIND_STATUS,  0) \
  X(30, M_GAS_VOLTAGE_MV,   "gas_voltage_mv",                 GRP_HEALTH,   KIND_NUM,     0) \
  X(31, M_GAS_STATUS,       "gas_status",                     GRP_HEALTH,   KIND_STATUS,  0) \
  X(32, M_TURB_DAYS_CLEAN,  "turbidity_days_since_cleaning",  GRP_HEALTH,   KIND_NUM,     0) \
  X(33, M_TDS_DAYS_CAL,     "tds_days_since_calibration",     GRP_HEALTH,   KIND_NUM,     0) \
  X(34, M_GAS_DAYS_CAL,     "gas_days_since_calibration",     GRP_HEALTH,   KIND_NUM,     0) \
  X(40, M_BATTERY_V,        "battery_v",                      GRP_DIAG,     KIND_NUM,     2) \
  X(41, M_FREE_HEAP_BYTES,  "free_heap_bytes",                GRP_DIAG,     KIND_NUM,     0) \
  X(42, M_UPTIME_S,         "uptime_s",                       GRP_DIAG,     KIND_NUM,     0) \
  X(43, M_RSSI_DBM,         "rssi_dbm",                       GRP_DIAG,     KIND_NUM,     0) \
  X(60, M_LED,              "led",                            GRP_METRICS,  KIND_NUM,     0)

typedef enum {
  #define X(id, e, ...) e = id,
    METRIC_TABLE(X)
  #undef X
} metric_id_t;

typedef struct {
  uint8_t id;
  const char *name;
  uint8_t group, kind, decimals;
} metric_info_t;

const metric_info_t *metric_find(uint8_t);
const char *status_name(uint8_t);