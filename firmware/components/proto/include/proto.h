#pragma once
#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

#define PROTO_MAGIC 0xA5
#define PROTO_CMD_MAGIC 0xA6
#define PROTO_VERSION 1
#define PROTO_MAX_FRAME 250 // limite de ESP-NOW

typedef enum { CMD_LED = 1 } proto_cmd_id_t;

typedef struct __attribute__((packed)) {
  uint8_t magic, version, node_id, seq, count; // 5 bytes
} proto_hdr_t;

typedef struct __attribute__((packed)) {
  uint8_t id;
  float value;
} proto_entry_t; // 5 bytes: hasta 49 metricas por trama

typedef struct __attribute__((packed)) {
  uint8_t magic, version, node_id, cmd, arg;
} proto_cmd_t;

typedef struct {
  uint8_t buf[PROTO_MAX_FRAME];
  size_t len;
} proto_frame_t;

/* Emisor */
void proto_begin(proto_frame_t *frame, uint8_t node_id, uint8_t seq);
bool proto_add(proto_frame_t *frame, uint8_t id, float value); // false si no cabe
void proto_cmd_build(proto_cmd_t *proto_cmd, uint8_t node_id, uint8_t cmd, uint8_t arg);

/* Receptor */
bool proto_parse(const uint8_t *data, size_t len, proto_hdr_t *hdr); // valida longitud y version
void proto_get(const uint8_t *data, size_t i, uint8_t *id, float *value);
bool proto_cmd_parse(const uint8_t *data, size_t len, proto_cmd_t *proto_cmd);