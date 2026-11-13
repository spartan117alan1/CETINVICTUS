#include "metrics.h"
#include <stddef.h>

static const metric_info_t TABLE[] = {
  #define X(id, e, name, grp, kind, dec) { id, name, grp, kind, dec },
    METRIC_TABLE(X)
  #undef X
};

const metric_info_t *metric_find(uint8_t id) {
  for(unsigned i = 0; i < sizeof TABLE / sizeof TABLE[0]; ++i)
    if(TABLE[i].id == id) return &TABLE[i];

  return NULL;
}

const char *status_name(uint8_t code) {
  switch(code) {
    case ST_OK: return "OK";
    case ST_WARNING: return "WARNING";
    case ST_FAULT: return "FAULT";
    default: return "UNKNOWN";
  }
}