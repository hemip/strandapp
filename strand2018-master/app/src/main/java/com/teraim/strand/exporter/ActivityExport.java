package com.teraim.strand.exporter;

import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.OutputStream;
import java.io.PrintStream;
import java.net.MalformedURLException;
import java.net.URL;
import java.net.URLConnection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.widget.Button;
import android.widget.ListView;
import android.widget.TextView;

import com.teraim.strand.Provyta;
import com.teraim.strand.R;
import com.teraim.strand.exporter.JSONify.JSON_Report;


public class ActivityExport extends Activity {
	static final int REQUEST_PERMISSION_READ = 1;
	static final int REQUEST_PERMISSION_WRITE = 2;
	private ListView pyListV;
	private int lagnummer;

	@Override
	protected void onCreate(Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);
		Intent i = getIntent();
		lagnummer = i.getIntExtra("lagnummer",0);
		setContentView(R.layout.activity_export);
        try
        {
            String app_ver = this.getPackageManager().getPackageInfo(this.getPackageName(), 0).versionName;
			Log.e("vetrox", app_ver);
			if (app_ver!=null) {
				((TextView)findViewById(R.id.versionField)).setText("App version: "+app_ver);
			}
        }
        catch (PackageManager.NameNotFoundException e)
        {
            Log.e("vetrox", e.getMessage());
        }

		parseAllPyToJson();


	}

	private void handleUncaughtException(Thread thread, Throwable e) {

		e.printStackTrace(); // not all Android versions will print the stack trace automatically

		//invokeLogActivity();


		invokeLogActivity();


	}

	private void invokeLogActivity(){
		Intent intent = new Intent ();

			intent.putExtra("program_version", "1.02");
			intent.putExtra("app_name","Exporter");
			intent.putExtra("user_name","peter");
			intent.putExtra("team_name","rockabillies");

		intent.setAction ("com.teraim.exporter.SEND_LOG"); // see step 5.
		intent.setFlags (Intent.FLAG_ACTIVITY_NEW_TASK); // required when starting from Application
		Log.d("vortex","Sending log file. Starting SendLog.");
		startActivity (intent);
		System.exit(1); // kill off the crashed app
	}

	private void exportMarkedRows(List<Provyta> pyL, Map<String,JSON_Report> jsonL) {
		boolean isChecked[] =((ProvytaAdapter) pyListV.getAdapter()).getIsChecked();
		int position =0;
		StringBuilder listB = new StringBuilder();

		for (boolean cb:isChecked) {
			if (cb) {
				//Find correct provyta and json

				Provyta py = pyL.get(position);
				if (py != null) {
					try {
						Log.d("vortex", "exporting py " + py.getpyID());
						Persistent.export(jsonL.get(py.getpyID()), py);
						listB.append(py.getpyID());
						listB.append("\n");
					} catch (FileNotFoundException e) {
						Log.e("vortex", "IO ERROR");
					}
				}

			}
			position++;
		}

		AlertDialog.Builder builder = new AlertDialog.Builder(this);
			builder.setTitle("Exporterade: ")
				.setMessage(listB.toString()).setPositiveButton("Ok", null)
				.show();
	}

	private Provyta findPy(String pyID, List<Provyta> pyList) {
		for (Provyta py:pyList) {
			if (py.getpyID().equals(pyID))
				return py;
		}
		return null;
	}

	


	private void parseAllPyToJson() {

		//Get provytor if any.
		final List<Provyta> pyL = Persistent.loadAll();
		final Map<String,JSON_Report> jsonL = new HashMap<String,JSON_Report>();
		Log.d("Strand", "pylist contains " + pyL.size() + " objects");

		//Generate JSON.
		JSONify jsonParser = new JSONify();

		//Parse all py into json
		try {
			for (Provyta py : pyL)
				if (py.isNormal()) {
					Log.d("Strand", "generating normal json for py " + py.getpyID());
					jsonL.put(py.getpyID(),jsonParser.normal(py));

				} else {
					Log.d("Strand", "generating json no_input for py " + py.getpyID());
					jsonL.put(py.getpyID(),jsonParser.noInput(py));

				}
		} catch (IOException e) {

			e.printStackTrace();
		}

		pyListV = (ListView) findViewById(R.id.list);
		//ArrayAdapter<Provyta> myDataAdapter = new ArrayAdapter<Provyta>(this,R.layout.pylist_row,R.id.pyName,pyList);

		pyListV.setAdapter(new ProvytaAdapter(this, pyL, jsonL));

		if (pyL.isEmpty()) {
			AlertDialog.Builder builder = new AlertDialog.Builder(this);
			builder.setTitle("Ingen mätdata")
					.setMessage("Programmet kunde inte hitta några påbörjade provytor.").setPositiveButton("Ok", null)
					.show();
		}

		Button exportButton = (Button)findViewById(R.id.button);

		exportButton.setOnClickListener(new View.OnClickListener() {
			@Override
			public void onClick(View v) {
				exportMarkedRows(pyL,jsonL);
			}
		});
		((Button)findViewById(R.id.uploadButton)).setOnClickListener(new View.OnClickListener() {
			@Override
			public void onClick(View v) {
				Intent intent_upload = new Intent(getBaseContext(), UploadActivity.class);
				intent_upload.putExtra("lagnummer",lagnummer);
				startActivity(intent_upload);
			}
		});
	}







}
