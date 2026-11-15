# Soufflé (Datalog) para el razonador del Pilar B (F5.3). Versión y suma fijadas.
# No es un servicio: se usa con `docker compose --profile reason run --rm souffle ...`,
# montando la carpeta de reglas y la de hechos.
FROM ubuntu:24.04

ARG SOUFFLE_VERSION=2.5
ARG SOUFFLE_DEB=x86_64-ubuntu-2404-souffle-2.5-Linux.deb
# Suma publicada en sha512sum.txt de la release 2.5
ARG SOUFFLE_SHA512=6b86e554f6aa5abf8a8b55d8312ae37c0957c5bd6c9edeea89246db9406f645ec5e600b84fe6636b1c163da556f0da6c3d2dad46c1083413f2fcf4f95b9ac62c

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && curl -fsSL -o /tmp/souffle.deb \
      "https://github.com/souffle-lang/souffle/releases/download/${SOUFFLE_VERSION}/${SOUFFLE_DEB}" \
 && echo "${SOUFFLE_SHA512}  /tmp/souffle.deb" | sha512sum -c - \
 && apt-get install -y --no-install-recommends /tmp/souffle.deb \
 && apt-get purge -y curl && apt-get autoremove -y \
 && rm -rf /tmp/souffle.deb /var/lib/apt/lists/*

# Usuario sin privilegios, con el mismo uid que el del anfitrión para escribir en la carpeta montada
RUN userdel -r ubuntu 2>/dev/null || true; useradd -u 1000 -m razonador
USER razonador
WORKDIR /work
ENTRYPOINT ["souffle"]
