#pragma once
#include <stdbool.h>
#include <stdint.h>

void link_start(void);
bool link_send_cmd(uint8_t node_id, uint8_t cmd, uint8_t arg);