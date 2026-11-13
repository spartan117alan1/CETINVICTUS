#pragma once
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>

#define MAX_NODES 8

typedef struct {
  bool used, online;
  uint8_t node_id, last_seq;
  uint8_t mac[6];
  int8_t rssi;
  int64_t last_seen_us;
  uint32_t frames;
} node_t;

static inline void node_device_id(char *out, size_t n, uint8_t id) {
  snprintf(out, n, "esp32_node_%02u", id);
}

void nodes_init(void);
bool nodes_touch(uint8_t, const uint8_t*, int8_t, uint8_t, bool*);
size_t nodes_expire(int64_t, uint8_t*, size_t);
size_t nodes_snapshot(node_t*, size_t);