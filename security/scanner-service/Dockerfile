FROM python:3.11.13-slim-bookworm

ARG AIG_SKILL_SCAN_SHA256=1a55f99199b0d0c2e2270a00ef8a1913b15eab69752bdd662630205ae453a62c

ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN python -m venv /opt/venv \
    && useradd --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin --uid 10001 scanner

WORKDIR /opt/scanner
COPY requirements.lock ./requirements.lock
RUN pip install --no-cache-dir --requirement requirements.lock \
    && pip download --no-deps --dest /tmp/wheels aig-skill-scan==0.2.1 \
    && echo "${AIG_SKILL_SCAN_SHA256}  /tmp/wheels/aig_skill_scan-0.2.1-py3-none-any.whl" | sha256sum --check --strict \
    && pip install --no-cache-dir --no-deps /tmp/wheels/aig_skill_scan-0.2.1-py3-none-any.whl \
    && rm -rf /tmp/wheels

COPY entrypoint.py server.py ./
COPY THIRD_PARTY_NOTICES.md /usr/share/doc/hillm-nav-ai-security/THIRD_PARTY_NOTICES.md

RUN mkdir -p /work/input /work/output /work/tmp \
    && chown -R scanner:scanner /work/output /work/tmp \
    && chmod 0555 /opt/scanner /work/input \
    && chmod 0750 /work/output /work/tmp

USER 10001:10001
EXPOSE 8091
ENTRYPOINT ["python", "/opt/scanner/server.py"]
