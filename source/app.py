# @author rmitsch
# @date 2017-07-01
#
#  To start:
#   0. Create virtualenv inside project (http://stackoverflow.com/questions/10763440/how-to-install-python3-version-of-package-via-pip-on-ubuntu)
#       virtualenv -p /usr/bin/python3 py3env
#   1. Start virtual env. (see link above).
#       source py3env/bin/activate
#   1a. Install dependencies in virtual environment.
#       py3env/bin/pip3.5 install ...
#   2. Execute app.py with path to virtual env. inside project (py3env/bin/python3 source/app.py).
import os
from flask import Flask
from flask import render_template
from flask import request, redirect, url_for, send_from_directory
# Import ODS Reader.
from fileReader.ODSReader import ODSReader


# For a given file, return whether it's an allowed type or not
def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1] in app.config['ALLOWED_EXTENSIONS']

app = Flask(__name__)
# Define version.
version = "1.7.0"

# This is the path to the upload directory.
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(os.path.realpath(__file__)), "../data/")
# These are the extension that we are accepting to be uploaded.
# Currently only .ods supported.
app.config['ALLOWED_EXTENSIONS'] = set(['ods'])


# root: Render HTML.
@app.route("/")
def index():
    return render_template("index.html", version=version)


# Process file upload.
@app.route('/upload', methods=['POST'])
def upload():
    # Get the name of the uploaded file
    file = request.files['file']
    # Check if the file is one of the allowed types/extensions
    if file and allowed_file(file.filename):
        # Move the file from the temporal folder to the upload folder we set up.
        file.save(os.path.join(app.config['UPLOAD_FOLDER'], "spreadsheet.ods"))
        # Redirect the user to the uploaded_file route, which will basicaly show on the browser the uploaded file.
        return redirect("/dashboard")

    else:
        return "Wrong file format."


# Show dashboard.
@app.route("/dashboard")
def dashboard():
    return render_template("dashboard.html", version=version)


# Route for fetching data from spreadsheet.
@app.route("/entries")
def getEntries():
    # Read from file with hardcoded file path.
    reader = ODSReader(os.path.join(app.config['UPLOAD_FOLDER'], "spreadsheet.ods"))
    # Get data as JSON object.
    return reader.getEntries()

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5000, debug=True)