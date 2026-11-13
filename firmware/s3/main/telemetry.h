#pragma once
#include <stddef.h>
#include <stdint.h>

void telemetry_from_node(const uint8_t*, size_t, int8_t);
void telemetry_from_gateway(void);