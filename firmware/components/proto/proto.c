#include <string.h>
#include "proto.h"

void proto_begin(proto_frame_t *frame, uint8_t node_id, uint8_t seq) {
  proto_hdr_t hdr = { PROTO_MAGIC, PROTO_VERSION, node_id, seq, 0 };
  memcpy(frame->buf, &hdr, sizeof hdr);
  frame->len = sizeof hdr;
}

bool proto_add(proto_frame_t *frame, uint8_t id, float value) {
  if(frame->len + sizeof(proto_entry_t) > PROTO_MAX_FRAME) return false;

  proto_entry_t entry = { id, value };
  memcpy(frame->buf + frame->len, &entry, sizeof entry);
  frame->len += sizeof entry;
  frame->buf[offsetof(proto_hdr_t, count)]++;
  return true;
}

void proto_cmd_build(proto_cmd_t *c, uint8_t node_id, uint8_t cmd, uint8_t arg) {
  *c = (proto_cmd_t){ PROTO_CMD_MAGIC, PROTO_VERSION, node_id, cmd, arg };
}

bool proto_parse(const uint8_t *data, size_t len, proto_hdr_t *hdr) {
  if(len < sizeof *hdr) return false;

  memcpy(hdr, data, sizeof *hdr);
  if(hdr->magic != PROTO_MAGIC || hdr->version != PROTO_VERSION) return false;
  return len == sizeof *hdr + (size_t)hdr->count * sizeof(proto_entry_t);
}

void proto_get(const uint8_t *data, size_t i, uint8_t *id, float *value) {
  const uint8_t *p = data + sizeof(proto_hdr_t) + i * sizeof(proto_entry_t);
  *id = p[0];
  memcpy(value, p + 1, sizeof *value);
}

bool proto_cmd_parse(const uint8_t *data, size_t len, proto_cmd_t *c) {
  if(len != sizeof *c) return false;
  memcpy(c, data, sizeof *c);
  return c->magic == PROTO_CMD_MAGIC && c->version == PROTO_VERSION;
}