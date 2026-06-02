package com.teraim.strand;

import java.util.ArrayList;
import java.util.HashMap;

import android.content.Context;
import android.graphics.Color;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.widget.SimpleAdapter;


public class TableAdapter extends SimpleAdapter {

  private int[] colors = new int[] { 0x30FF0000, 0x300000FF };
	public TableAdapter(Context ctx,
			ArrayList<HashMap<String, String>> mylistData, int listRow,
			String[] columnTags, int[] columnIds) {
		super(ctx,mylistData,listRow,columnTags,columnIds);
	}

	 @Override
	    public View getView(int position, View convertView, ViewGroup parent) {
	      View view = super.getView(position, convertView, parent);
		      return view;
	    }


}
