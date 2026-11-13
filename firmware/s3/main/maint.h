#pragma once
#include <stdbool.h>
#include <stdint.h>

void maint_init(void);
bool maint_mark(uint8_t node_id, const char *sensor);
float maint_days(uint8_t node_id, const char *sensor);