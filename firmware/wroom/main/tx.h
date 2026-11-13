#pragma once
#include <stddef.h>
#include <stdint.h>
#include <stdbool.h>
#include "proto.h"

void tx_start(void);
void tx_send(const uint8_t *data, size_t len);
bool tx_linked(void);
bool tx_poll_cmd(proto_cmd_t *out); 