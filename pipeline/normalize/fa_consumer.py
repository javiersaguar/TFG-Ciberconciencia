"""Confirmación explícita de posiciones para consumidores del espacio FA.

Los jobs existentes se mantienen intactos. Se evitan commits implícitos sin
offset almacenado cuando el lote contiene particiones vacías.
"""


def install():
    import confluent_kafka
    if getattr(confluent_kafka.Consumer, "_fa_positions", False):
        return
    native = confluent_kafka.Consumer

    class PositionConsumer:
        _fa_positions = True

        def __init__(self, config):
            if not str(config.get("group.id", "")).startswith("fa-"):
                raise ValueError("El consumidor FA requiere un grupo fa-* explícito")
            self._consumer = native(config)

        def __getattr__(self, name):
            return getattr(self._consumer, name)

        def commit(self, *args, **kwargs):
            if not args and "offsets" not in kwargs and "message" not in kwargs:
                positions = self._consumer.position(self._consumer.assignment())
                positions = [p for p in positions if p.offset >= 0]
                if not positions:
                    return None
                kwargs["offsets"] = positions
            return self._consumer.commit(*args, **kwargs)

    confluent_kafka.Consumer = PositionConsumer
