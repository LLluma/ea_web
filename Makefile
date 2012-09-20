.PHONY: all doc release clean

HOST = 127.0.0.1
PORT = 8080

all: run

run:
	python openerp-web.py -a ${HOST} -p ${PORT}

release:
	python setup.py sdist

install:
	python setup.py install

clean:
	@find . -name '*.pyc' -exec rm -f {} +
	@find . -name '*.pyo' -exec rm -f {} +
	@find . -name '*.swp' -exec rm -f {} +
	@find . -name '*~' -exec rm -f {} +
	@rm -rf build
	@rm -rf dist
	@rm -rf *.egg-info

doc:
	make -C doc html

cloc:
	cloc addons/*/common/*.py addons/*/controllers/*.py addons/*/static/src/*.js addons/*/static/src/js/*.js addons/*/static/src/css/*.css addons/*/static/src/xml/*.xml

blamestat:
	echo addons/*/common/*.py addons/*/controllers/*.py addons/*/static/src/js/*.js addons/*/static/src/css/*.css addons/*/static/src/xml/*.xml  | xargs -t -n 1 bzr blame -v --long --all |  awk '{print $2}' | sort | uniq -c | sort -n

