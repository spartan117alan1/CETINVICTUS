idf_component_register(
  SRCS "tsw20.c"
  INCLUDE_DIRS "include"
  REQUIRES adc_input
  PRIV_REQUIRES esp_timer
)