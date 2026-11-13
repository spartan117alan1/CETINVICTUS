#pragma once
#include <stdbool.h>
#include <stdint.h>
#include "proto.h"

void sensors_init(void);
bool sensors_poll(int64_t now_us);
void sensors_fill(proto_frame_t *frame);
void sensors_set_led(bool on);