#include <stdint.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_timer.h"
#include "board.h"
#include "button.h"
#include "display.h"
#include "gw_config.h"
#include "link.h"
#include "net.h"
#include "maint.h"
#include "telemetry.h"
#include "ui.h"

#define CPU_HZ (CONFIG_ESP_DEFAULT_CPU_FREQ_MHZ * 1000000u)
#define DEBOUNCE_MS 30u

void app_main(void) {
  display_init();
  net_start();
  maint_init();
  link_start();
  ui_start();

  button_t btn;
  button_init(&btn, BTN_PIN);

  uint64_t t_gw = 0;

  while(1) {
    if(button_pressed(&btn)) ui_next_page();

    int64_t now = esp_timer_get_time();
    if(now - t_gw >= (int64_t)GW_REPORT_MS * 1000) {
      telemetry_from_gateway();
      t_gw = now;
    }

    vTaskDelay(pdMS_TO_TICKS(10));
  }
}