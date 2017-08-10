# Source: https://github.com/prakhar1989/docker-curriculum

# Instructions copied from - https://hub.docker.com/_/python/
FROM jfloff/alpine-python:3.4

# tell the port number the container should expose
EXPOSE 5000

# Copy source in container.
COPY source /source
COPY requirements.txt /tmp/requirements.txt

# Install dependencies.
RUN pip install -r /tmp/requirements.txt

# run the command
CMD ["python", "./source/app.py"]