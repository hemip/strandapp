package com.teraim.strand.utils;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.util.ArrayList;
import java.util.List;

import android.util.JsonWriter;
import android.util.Log;

import com.teraim.strand.Provyta;

public class JSONify {
	
	public void test() throws FileNotFoundException, IOException {
		List<Provyta> pyl = new ArrayList<Provyta>();
		Provyta py1 = new Provyta("12345");
		Provyta py2 = new Provyta("678910");
		pyl.add(py1);
		pyl.add(py2);
		File file = new File(Constants.LOCAL_DATA_DIR +"test.txt");
		start(new FileOutputStream(file),pyl);
	}

	public void start(OutputStream out, List<Provyta> pyl) throws IOException {
		JsonWriter writer = new JsonWriter(new OutputStreamWriter(out, "UTF-8"));
		writer.setIndent("  ");
		//An array of Provytor.
		writer.beginArray();
		for (Provyta py:pyl) 
			writeYta(writer, py);
		writer.endArray();
		writer.close();
	}
	public void writeYta(JsonWriter writer, Provyta py) throws IOException {
		writer.beginObject();
		Log.d("Strand","Writing Provyta "+py.getpyID());
		writer.name("pyID").value(py.getpyID());
		writer.endObject();
	}


}
