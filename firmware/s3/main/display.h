#pragma once
#include <stdint.h>

void display_init(void);
void display_clear(void);
void display_printf(int line, const char *fmt, ...); // línea 0..7, 21 caracteres
void display_flush(void);