# Source: https://github.com/prakhar1989/docker-curriculum

# Instructions copied from - https://hub.docker.com/_/python/
FROM python:3-onbuild

# tell the port number the container should expose
EXPOSE 5000

# run the command
CMD ["python", "./source/app.py"]